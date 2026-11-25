/**
 * An e-mail address shown without giving it away: the first character of the part before the `@`,
 * three dots, and the domain whole ("anna.rossi@example.com" → "a•••@example.com"). The page and
 * the assistant show it when they say where a mail goes (docs/EMAIL_ARCHITECTURE.md section 7).
 * A text without an `@`, or with nothing before it, shows only the dots.
 */
export function maskAddress(address: string): string {
  const at = address.lastIndexOf('@');
  if (at <= 0) return '•••';
  return `${address[0]}•••${address.slice(at)}`;
}
