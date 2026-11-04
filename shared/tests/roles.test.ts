import { resolveRole } from '../src/index';

// Architecture section 3, the four group combinations.
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
