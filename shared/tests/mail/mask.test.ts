import { maskAddress } from '../../src/index';

describe('maskAddress', () => {
  it.each([
    ['anna.rossi@example.com', 'a•••@example.com'],
    ['a@example.com', 'a•••@example.com'],
    ['"odd@name"@example.com', '"•••@example.com'],
  ])('masks %s', (address, masked) => {
    expect(maskAddress(address)).toBe(masked);
  });

  it.each([[''], ['no-at-sign'], ['@example.com']])('shows only the dots for %j', (address) => {
    expect(maskAddress(address)).toBe('•••');
  });
});
