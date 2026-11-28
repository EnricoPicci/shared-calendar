import { meDetails, meFields } from '../../../src/logic/me.model';
import { useFarBrowserZone } from './zone';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';

// "My details" of docs/EMAIL_ARCHITECTURE.md section 11: GET /me's answer in the screen's words.

const ALICE = { username: 'alice', role: 'user' as const, givenName: 'Alice', familyName: 'Liddell', email: 'alice@example.com', address: 'Via Po 2\n10100 Torino' };
const BARE_ADMIN = { username: 'admin', role: 'admin' as const, givenName: null, familyName: null, email: null, address: null };

describe('the model of "My details"', () => {
  useFarBrowserZone();

  it('a User with the four facts: each as it is, the role in words', () => {
    expect(meDetails(PAGE_TEXTS_EN, ALICE)).toEqual({ ...ALICE, role: 'User' });
    expect(meFields(ALICE)).toEqual({ givenName: 'Alice', familyName: 'Liddell', email: 'alice@example.com', address: 'Via Po 2\n10100 Torino' });
  });

  it('an Administrator without facts yet: each one "Not set", and the Edit dialog empty', () => {
    expect(meDetails(PAGE_TEXTS_EN, BARE_ADMIN)).toEqual({ username: 'admin', role: 'Administrator', givenName: PAGE_TEXTS_EN.profile.notSet, familyName: PAGE_TEXTS_EN.profile.notSet, email: PAGE_TEXTS_EN.profile.notSet, address: PAGE_TEXTS_EN.profile.notSet });
    expect(PAGE_TEXTS_EN.profile.notSet).toBe('Not set');
    expect(meFields(BARE_ADMIN)).toEqual({ givenName: '', familyName: '', email: '', address: '' });
  });

  it('a text with <script> is kept as text', () => {
    expect(meDetails(PAGE_TEXTS_EN, { ...ALICE, givenName: '<script>x</script>' }).givenName).toBe('<script>x</script>');
  });
});
