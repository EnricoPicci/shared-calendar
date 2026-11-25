import { meDetails, meFields, NOT_SET } from '../../../src/logic/me.model';
import { useFarBrowserZone } from './zone';

// "My details" of docs/EMAIL_ARCHITECTURE.md section 11: GET /me's answer in the screen's words.

const ALICE = { username: 'alice', role: 'user' as const, givenName: 'Alice', familyName: 'Liddell', email: 'alice@example.com', address: 'Via Po 2\n10100 Torino' };
const BARE_ADMIN = { username: 'admin', role: 'admin' as const, givenName: null, familyName: null, email: null, address: null };

describe('the model of "My details"', () => {
  useFarBrowserZone();

  it('a User with the four facts: each as it is, the role in words', () => {
    expect(meDetails(ALICE)).toEqual({ ...ALICE, role: 'User' });
    expect(meFields(ALICE)).toEqual({ givenName: 'Alice', familyName: 'Liddell', email: 'alice@example.com', address: 'Via Po 2\n10100 Torino' });
  });

  it('an Administrator without facts yet: each one "Not set", and the Edit dialog empty', () => {
    expect(meDetails(BARE_ADMIN)).toEqual({ username: 'admin', role: 'Administrator', givenName: NOT_SET, familyName: NOT_SET, email: NOT_SET, address: NOT_SET });
    expect(NOT_SET).toBe('Not set');
    expect(meFields(BARE_ADMIN)).toEqual({ givenName: '', familyName: '', email: '', address: '' });
  });

  it('a text with <script> is kept as text', () => {
    expect(meDetails({ ...ALICE, givenName: '<script>x</script>' }).givenName).toBe('<script>x</script>');
  });
});
