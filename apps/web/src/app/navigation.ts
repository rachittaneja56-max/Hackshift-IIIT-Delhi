export const primaryNavigation = [
  { href: '/learn', label: 'Learn', key: 'learn' },
  { href: '/practice', label: 'Practice', key: 'practice' },
  { href: '/evidence', label: 'My Work', key: 'work' },
  { href: '/opportunities', label: 'Opportunities', key: 'opportunities' },
] as const;

export type PrimaryNavigationKey = typeof primaryNavigation[number]['key'];

export function activePrimaryNavigation(path: string): PrimaryNavigationKey | undefined {
  if (path === '/' || path.startsWith('/learn')) return 'learn';
  if (path === '/practice' || path === '/lab' || path.startsWith('/lab/')) return 'practice';
  if (path === '/evidence' || path.startsWith('/evidence/')) return 'work';
  if (path === '/opportunities' || path.startsWith('/career/') || path === '/demo/journey') return 'opportunities';
  return undefined;
}
