import { resolveRole } from '../src/index';

// The four group combinations of docs/ARCHITECTURE.md section 3.
describe('resolveRole', () => {
  it.each([
    [['admin'], 'admin'],
    [['user'], 'user'],
    [['admin', 'user'], 'admin'],
    [['user', 'admin'], 'admin'],
    [[], null],
    [['other'], null],
  ])('groups %j resolve to %s', (groups, role) => {
    expect(resolveRole(groups)).toBe(role);
  });
});
