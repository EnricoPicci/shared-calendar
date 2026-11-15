export type Role = 'admin' | 'user';

// admin wins over user; in neither group means no role (docs/ARCHITECTURE.md section 3).
export function resolveRole(groups: readonly string[]): Role | null {
  if (groups.includes('admin')) return 'admin';
  if (groups.includes('user')) return 'user';
  return null;
}
