// Live provider probe. Run only with a host-side E2B_API_KEY. No secret is sent to the VM.
import { Sandbox, CommandExitError } from 'e2b';

const starter = `export class FixedWindowLimiter {
  constructor(limit, windowMs, now = () => Date.now()) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.state = new Map();
  }

  check(key) {
    const time = this.now();
    const bucket = this.state.get('all') ?? { start: time, count: 0 };
    if (time > bucket.start + this.windowMs) {
      bucket.start = time;
      bucket.count = 0;
    }
    bucket.count += 1;
    this.state.set('all', bucket);
    if (bucket.count > this.limit) {
      return { allowed: false, retryAfterSeconds: 0 };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
`;

const repaired = `export class FixedWindowLimiter {
  constructor(limit, windowMs, now = () => Date.now()) {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1) {
      throw new RangeError('limit and windowMs must be positive integers');
    }
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.state = new Map();
  }

  check(key) {
    const time = this.now();
    const start = Math.floor(time / this.windowMs) * this.windowMs;
    const prior = this.state.get(key);
    const count = prior?.start === start ? prior.count : 0;
    if (count >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.ceil((start + this.windowMs - time) / 1000) };
    }
    this.state.set(key, { start, count: count + 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
`;

const files = {
  'package.json': JSON.stringify({ name: 'rate-limiter-debugging', private: true, type: 'module', scripts: { test: 'tsx --test tests/visible.test.ts' }, devDependencies: { tsx: '4.20.0' } }, null, 2) + '\n',
  'README.md': '# Rate limiter debugging\n\nA fixed-window limiter keyed by the caller identity. Only src/rateLimiter.ts may change.\n',
  'src/rateLimiter.ts': starter,
  'src/server.ts': "import { FixedWindowLimiter } from './rateLimiter.ts';\nexport const limiter = new FixedWindowLimiter(2, 1000);\n",
  'src/types.ts': 'export type Decision = { allowed: boolean; retryAfterSeconds: number };\n',
  'tests/visible.test.ts': `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedWindowLimiter } from '../src/rateLimiter.ts';

test('the exact fixed-window boundary opens a new window', () => {
  let now = 0;
  const limiter = new FixedWindowLimiter(1, 1000, () => now);
  assert.equal(limiter.check('a').allowed, true);
  now = 1000;
  assert.equal(limiter.check('a').allowed, true);
});

test('a second API key has its own allowance', () => {
  const limiter = new FixedWindowLimiter(1, 1000, () => 100);
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('b').allowed, true);
});

test('denial gives a positive retry delay', () => {
  const limiter = new FixedWindowLimiter(1, 1000, () => 950);
  limiter.check('a');
  assert.equal(limiter.check('a').retryAfterSeconds, 1);
});
`
};

function measured(result, durationMs) {
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, durationMs };
}

async function run(sandbox, command) {
  const start = performance.now();
  try {
    return measured(await sandbox.commands.run(command, { cwd: '/home/user/lab', timeoutMs: 30_000 }), Math.round(performance.now() - start));
  } catch (error) {
    if (error instanceof CommandExitError) return measured(error, Math.round(performance.now() - start));
    throw error;
  }
}

if (!process.env.E2B_API_KEY) throw new Error('E2B_API_KEY is required in the host process');
let sandbox;
let sandboxId;
const observation = { sdk: 'e2b@2.56.0', createdAt: new Date().toISOString() };
try {
  const started = performance.now();
  sandbox = await Sandbox.create({ timeoutMs: 180_000, allowInternetAccess: true, metadata: { purpose: 'trajectoryos-spike' } });
  sandboxId = sandbox.sandboxId;
  observation.createDurationMs = Math.round(performance.now() - started);
  observation.sandboxId = sandboxId;
  await sandbox.files.makeDir('/home/user/lab');
  await sandbox.files.makeDir('/home/user/lab/src');
  await sandbox.files.makeDir('/home/user/lab/tests');
  observation.node = await run(sandbox, 'node --version');
  for (const [path, value] of Object.entries(files)) await sandbox.files.write(`/home/user/lab/${path}`, value);
  observation.install = await run(sandbox, 'npm install --no-audit --no-fund');
  if (observation.install.exitCode !== 0) throw new Error('Sandbox dependency installation failed');
  observation.before = await run(sandbox, 'npm test');
  observation.readMatchesStarter = (await sandbox.files.read('/home/user/lab/src/rateLimiter.ts')) === starter;
  await sandbox.files.write('/home/user/lab/src/rateLimiter.ts', repaired);
  observation.after = await run(sandbox, 'npm test');
  observation.readMatchesRepair = (await sandbox.files.read('/home/user/lab/src/rateLimiter.ts')) === repaired;
} finally {
  if (sandboxId) {
    observation.killed = await Sandbox.kill(sandboxId);
    observation.runningAfterKill = await sandbox.isRunning().catch(() => false);
  }
  console.log(JSON.stringify(observation, null, 2));
}

if (observation.before?.exitCode === 0 || observation.after?.exitCode !== 0 || !observation.readMatchesStarter || !observation.readMatchesRepair || !observation.killed || observation.runningAfterKill) {
  process.exitCode = 1;
}
