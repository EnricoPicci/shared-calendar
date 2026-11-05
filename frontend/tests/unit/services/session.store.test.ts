import type { Session } from '../../../src/services/login.types';
import { SessionStore } from '../../../src/services/session.store';
import { session } from './fixtures';

// docs/FRONTEND_SERVICES.md section 9.8. Fake timers drive the expiry (RxJS's timer uses
// setTimeout). The LoginService rows of the table are in login.service.test.ts.

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function recorded() {
  const store = new SessionStore();
  const values: (Session | null)[] = [];
  store.session$.subscribe((s) => values.push(s));
  return { store, values };
}

describe('SessionStore', () => {
  it('initial: session$ gives null at once', () => {
    expect(recorded().values).toEqual([null]);
  });

  it('set: session$ gives the session; a late subscriber gets it too', () => {
    const { store, values } = recorded();
    const a = session();
    store.set(a);
    expect(values).toEqual([null, a]);
    const late: (Session | null)[] = [];
    store.session$.subscribe((s) => late.push(s));
    expect(late).toEqual([a]);
  });

  it('expiry: null at expiresAt, still the session one millisecond before', () => {
    const { store, values } = recorded();
    store.set(session({}, 15));
    vi.advanceTimersByTime(15 * 60_000 - 1);
    expect(values.at(-1)).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(values.at(-1)).toBeNull();
    expect(values).toHaveLength(3);
  });

  it('re-arm: set(a) then set(b) with a later expiry; nothing at a, null at b', () => {
    const { store, values } = recorded();
    const a = session({}, 5);
    const b = session({ accessToken: 'b' }, 10);
    store.set(a);
    store.set(b);
    vi.advanceTimersByTime(5 * 60_000);
    expect(values.at(-1)).toBe(b);
    vi.advanceTimersByTime(5 * 60_000);
    expect(values).toEqual([null, a, b, null]);
  });

  it('already expired: set() with expiresAt in the past gives null, never the dead session', () => {
    const { store, values } = recorded();
    store.set(session());
    store.set(session({}, -1));
    expect(values.at(-1)).toBeNull();
    expect(values).toHaveLength(3);
  });

  it('already expired on an empty store: nothing is emitted', () => {
    const { store, values } = recorded();
    store.set(session({}, 0));
    expect(values).toEqual([null]);
  });

  it('clear: null, and the timer is cancelled', () => {
    const { store, values } = recorded();
    store.set(session());
    store.clear();
    vi.advanceTimersByTime(60 * 60_000);
    expect(values).toHaveLength(3);
    expect(values.at(-1)).toBeNull();
  });

  it('clear twice: one null only', () => {
    const { store, values } = recorded();
    store.set(session());
    store.clear();
    store.clear();
    expect(values.filter((v) => v === null)).toHaveLength(2); // the initial one and one clear
  });

  it("replace: set(a), replace(a, b) gives b, and the timer follows b's expiry", () => {
    const { store, values } = recorded();
    const a = session({}, 5);
    const b = session({ accessToken: 'b' }, 10);
    store.set(a);
    store.replace(a, b);
    expect(values.at(-1)).toBe(b);
    vi.advanceTimersByTime(5 * 60_000);
    expect(values.at(-1)).toBe(b);
    vi.advanceTimersByTime(5 * 60_000);
    expect(values.at(-1)).toBeNull();
  });

  it('replace, stale: set(a), set(c), replace(a, b) changes nothing', () => {
    const { store, values } = recorded();
    const a = session();
    const c = session({ username: 'carol' });
    store.set(a);
    store.set(c);
    store.replace(a, session({ accessToken: 'b' }));
    expect(values).toEqual([null, a, c]);
  });

  it('replace after a clear: nothing is revived', () => {
    const { store, values } = recorded();
    const a = session();
    store.set(a);
    store.clear();
    store.replace(a, session({ accessToken: 'b' }));
    expect(values).toEqual([null, a, null]);
  });

  it('clear(only), stale: set(a), set(c), clear(a) changes nothing; clear(c) gives null', () => {
    const { store, values } = recorded();
    const a = session();
    const c = session({ username: 'carol' });
    store.set(a);
    store.set(c);
    store.clear(a);
    expect(values).toEqual([null, a, c]);
    store.clear(c);
    expect(values).toEqual([null, a, c, null]);
    vi.advanceTimersByTime(60 * 60_000);
    expect(values).toHaveLength(4);
  });
});
