export type Role = 'admin' | 'user';

// Architecture section 3: admin wins over user; in neither group means no role.
export function resolveRole(groups: readonly string[]): Role | null {
  if (groups.includes('admin')) return 'admin';
  if (groups.includes('user')) return 'user';
  return null;
}
