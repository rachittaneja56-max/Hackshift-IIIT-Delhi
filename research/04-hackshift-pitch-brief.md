# HackShift 2026 — Pitch Brief

**Prepared:** 17 October 2026  
**Audience:** HackShift 2026 judges, IIIT Delhi  
**Team/build constraint:** Four team members, two primary developers, about 24 hours.  
**Important status note:** The research inputs describe a product idea, not a repository or end-to-end demo run. This review cannot verify which product functions are currently working. Do not present a proposed function as live until the team has run and checked it.

## Recommendation

Pitch a **focused, AI-aware backend learning lab**. Do not pitch the full learning-to-mentor-to-employer-to-job journey as a novel platform. Current competitors include direct overlaps: Codility tests whether candidates catch deliberately wrong AI suggestions; HackerRank offers AI-assisted repository tasks; Chai Prep links core-CS learning with AI codebase interviews and design practice. The strongest honest claim is that the team is testing a narrow learning workflow, not filling a proven market gap.

## One-sentence problem statement

> Early-career backend learners need practice turning a CS concept into a tested engineering decision, especially when an AI suggestion looks plausible but may violate the behavior they promised.

This is a problem hypothesis, not a finding from student interviews. If challenged, say the team is testing whether learners encounter this gap.

## Product positioning

> **One realistic engineering task that captures what the learner designed, changed and tested—and exactly what the evidence can support.**

**Proposed mechanism:** short concept lesson → written behavior contract → critique a suspect AI suggestion → implement or explain a fix → run deterministic tests → view a bounded evidence card.

This wording describes the proposal. The actual demo must use only steps that are implemented and verified.

## Best live-demo narrative

### Scenario

A client submits a local transfer request. The server commits the operation, but the response is lost. The client retries. The learner must handle the retry without creating a second ledger movement.

Use a bounded, local database exercise. Do not claim distributed, external-payment or exactly-once guarantees.

### Demo sequence

1. **Set the contract:** Same idempotency key and same request returns the first result and creates no second movement; same key with a different request is rejected. State in advance how insufficient funds are handled.
2. **Show the weak suggestion:** A deliberately flawed approach stores used keys only in process memory and separates checking from the ledger write. Label it a seeded test fixture, not a claim that every AI tool produces this answer.
3. **Ask for the learner’s reasoning:** Before coding, state where the key is scoped, what happens on retry, what happens if the payload changes, and what race or restart case to test.
4. **Run the task:** Show the patch or recorded explanation and the exact tests the submitted build actually runs. At minimum, the intended cases are same-key replay, changed payload, fresh key, invalid request and concurrent same-key requests. Do not show a test as passing unless the runner produced that result.
5. **Show the evidence card:** Display the test names and results, submitted design note, and a limitation such as: “These checks cover the stated local task. They do not prove authorship, production-scale reliability or job readiness.”
6. **Optional mentor preview:** If implemented, show a learner-selected snapshot with consent controls. If it is a static mock-up, label it “proposed preview.” Never imply a real mentor received or answered the request.

### Why this demo works

It connects a recognizable backend failure to a behavior contract, a specific test and a bounded report. The audience can see the evidence rather than being asked to trust a generated “AI score.” Stripe publicly documents idempotent requests as a real API pattern: [Stripe API Reference](https://docs.stripe.com/api/idempotent_requests).

### Failure fallback

If live code execution or an external model fails, show a pre-recorded run only if it is the team’s actual run and its exact build is identified. Otherwise switch to a clearly labeled fixture. Do not present an animation, seeded report or AI-generated text as a live evaluation.

## Six-slide presentation outline

### Slide 1 — The engineering task is changing

**Message:** AI tools are now part of many developers’ workflows, and developers report checking generated output before using it.  
**Evidence:** The 2026 Stack Overflow Developer Survey reports 65.9% of respondents use AI coding assistants/agents at work; among respondents describing validation, 76.5% say they run output locally and 53.0% inspect tests/security. The survey is opt-in and self-reported, not a hiring study.  
**Visual:** One concise flow: AI suggestion → codebase/tests → human decision.  
**Avoid:** “99% of code is AI-written” or “all employers now require AI fluency.”  
**Source:** [Survey data](https://survey.stackoverflow.co/2026/ai/data), [methodology](https://survey.stackoverflow.co/2026/methodology).

### Slide 2 — Our focus is learning transfer, not another assessment suite

**Message:** Existing products already offer learning, AI-enabled repository assessment and recorded reports. Our test is whether one short concept-to-task loop helps a student apply a backend concept.  
**Evidence:** Mention Codility AI-Native Tasks, HackerRank Plan-Build-Review and Chai Prep as direct overlaps.  
**Visual:** Small comparison: “course only” → “our proposed lesson + task + test evidence”; do not claim competitors lack the latter.  
**Avoid:** “first,” “only,” “no one combines this,” “we replace HackerRank.”

### Slide 3 — One challenge: safe retries

**Message:** A timeout can leave a client unsure whether an operation committed. The exercise asks the learner to define and test safe retry behavior.  
**Visual:** Request → commit → response lost → retry → one recorded movement. Use an exact scenario and a short written contract.  
**Evidence:** Stripe’s public API documentation describes idempotent requests.  
**Avoid:** Calling the task a real payment product, or claiming exactly-once effects beyond this local exercise.  
**Source:** [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests).

### Slide 4 — We show what happened, not a vague readiness score

**Message:** The report links each claim to a submitted artifact or a recorded test.  
**Visual:** One actual result: test name/status, short design excerpt, one limitation.  
**State:** Which tests ran, which passed/failed, what is seeded, whether a human reviewed the design, and whether any AI-generated feedback is interpretive.  
**Avoid:** “proves competence,” authorship detection, “job-ready,” or an overall hiring score.

### Slide 5 — The learner gets value before employers join

**Message:** First user is a student practicing backend engineering; a self-guided task can be useful without a mentor or employer account.  
**Distribution hypothesis:** A faculty or placement-led cohort could run the exercise. No partnership is established unless the team has one in writing.  
**Business hypotheses:** free starter task; paid advanced practice; later college cohort access or sponsored challenges. No price or revenue forecast is validated.  
**Visual:** Student → one task → feedback; use dotted lines for future mentor/employer use.

### Slide 6 — What we will validate next

**Message:** We will test task clarity, transfer, reviewer interpretation and whether a cohort owner wants to run it.  
**Plan:** exploratory student sessions; second changed scenario; blind reviewer test of evidence card; one faculty/placement conversation.  
**Scope boundary:** no candidate ranking, no job matching, no résumé generation, no live mentor marketplace.  
**Ask:** “Would you try this single exercise with students, and what evidence would you need to judge whether it helped?” Do not ask judges to endorse a market claim.

## What to demonstrate versus describe as future work

| P0 — genuinely functioning | P1 — light but meaningful integration | P2 — roadmap or clearly labeled preview |
|---|---|---|
| One challenge prompt and explicit behavior contract; one seeded AI suggestion; task execution or a clearly labeled captured run; exact test results; learner explanation; evidence card with limits. | A short lesson linked to the task; candidate-selected mentor snapshot; one feedback summary linked to the recorded tests; cohort reset/demo controls. | Mentor marketplace and scheduling; employer dashboard or hiring score; JD parsing/matching; résumé tailoring; job discovery; multi-subject catalog; predictive skill score; cross-company comparisons. |

**Only mark P0 after a clean end-to-end run on the actual build.** The supplied research materials do not establish that any proposed feature has been implemented. If only a prototype exists, call it a prototype.

## Claims that must not be made

- “We are the first/only platform to assess whether AI is wrong.”
- “No competitor links learning and assessment.”
- “AI writes 99% of code,” “AI code is always insecure,” or any universal defect rate.
- “Employers want this,” “our partners include…,” or “recruiters trust this” without direct evidence.
- “The score predicts hiring success” or “a passing challenge proves job readiness.”
- “The tool proves authorship” or reliably detects AI-written code.
- “Exactly once” for transactions that cross external systems.
- “A mentor reviewed/responded” if the response is a seeded demo.

## Demo truth gate

Before the pitch, run the actual demo from a clean start and record a compact inventory:

1. Which steps work without manual database or browser edits?
2. Which tests actually execute, and what are their actual results?
3. Does the shown evidence card read directly from that run or from a fixture?
4. Which text is model-generated, deterministic or manually seeded?
5. Did a human reviewer see the submission?
6. Can the demo be reset and repeated without carrying over data?

No answer to these questions was supplied with the research request. Until verified, describe implementation status as unknown, not working.

## Judge objection preparation

See the stand-alone [05-judge-questions.md](05-judge-questions.md) for concise answers to the five hardest objections, including why not CodeSignal/HackerRank and what employers can reasonably trust.

## Sources

- [Stack Overflow Developer Survey 2026: AI data](https://survey.stackoverflow.co/2026/ai/data) and [methodology](https://survey.stackoverflow.co/2026/methodology).
- [Codility AI-Native Tasks](https://www.codility.com/ai-native-tasks/), [HackerRank Summer 2026 release](https://www.hackerrank.com/release/summer-2026/), and [Chai Prep](https://dsa.chaicode.com/).
- [Stripe API Reference: Idempotent requests](https://docs.stripe.com/api/idempotent_requests).

Sources accessed 17 October 2026. Product claims are attributed to official pages; market demand, differentiation and future distribution remain hypotheses.
