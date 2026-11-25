import { MeService } from '../../../src/services/me.service';
import { SessionStore } from '../../../src/services/session.store';
import { json, session } from './fixtures';
import { CONFIG, describeMethod, type MethodSpec } from './suite';

// docs/FRONTEND_SERVICES.md section 23: GET /me through the per-method suite, and the shape of
// its answer.

const ME = { username: 'alice', role: 'user', givenName: 'Alice', familyName: 'Liddell', email: 'alice@example.com', address: 'Via Po 2\n10100 Torino' };

const getMe: MethodSpec<MeService> = {
  name: 'getMe',
  result$: (s) => s.meResult$,
  state$: (s) => s.meState$,
  call: (s) => s.getMe(),
  pending: { status: 'pending' },
  request: { method: 'GET', path: '/me' },
  // A field the contract does not have is not kept.
  ok: () => json(200, { ...ME, sub: 'not-kept' }),
  success: { status: 'success', me: ME },
  wrong: [
    ['200 without the username', () => json(200, { ...ME, username: undefined })],
    ['200 with another role', () => json(200, { ...ME, role: 'owner' })],
    ['200 without a fact', () => json(200, { ...ME, email: undefined })],
    ['200 with a fact that is no text', () => json(200, { ...ME, address: 3 })],
    ['201', () => json(201, ME)],
  ],
  codes: ['forbidden', 'user_not_found', 'internal_error'],
  notCodes: ['cannot_edit_admin'],
};

describeMethod((store) => new MeService(CONFIG, store), getMe);

describe('MeService.getMe, the facts not held yet', () => {
  it('an account without its facts: each one null, the rest as it is', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(200, { username: 'admin', role: 'admin', givenName: null, familyName: null, email: null, address: null })));
    const store = new SessionStore();
    store.set(session({ username: 'admin', role: 'admin', accessToken: 'access-token-admin' }));
    const service = new MeService(CONFIG, store);
    const results: unknown[] = [];
    service.meResult$.subscribe((r) => results.push(r));
    service.getMe();
    await vi.waitFor(() => expect(results).toHaveLength(1));
    expect(results[0]).toEqual({ status: 'success', me: { username: 'admin', role: 'admin', givenName: null, familyName: null, email: null, address: null } });
    store.clear();
    vi.unstubAllGlobals();
  });
});
