import { BehaviorSubject, Observable, Subscription, timer } from 'rxjs';
import type { Session } from './login.types';

// docs/FRONTEND_SERVICES.md section 9. The one holder of the signed-in Session, and the only
// place in the front end that holds tokens (rule 9). Not a service: it makes no remote call.
export class SessionStore {
  private readonly sessionSubject = new BehaviorSubject<Session | null>(null);
  readonly session$: Observable<Session | null> = this.sessionSubject.asObservable();

  // Clears the session at its expiry; re-armed by every set(), cancelled by clear().
  private expiry?: Subscription;

  set(session: Session): void {
    this.expiry?.unsubscribe();
    if (session.expiresAt.getTime() <= Date.now()) {
      this.clear(); // never publish a session that is already dead
      return;
    }
    this.sessionSubject.next(session);
    this.expiry = timer(session.expiresAt).subscribe(() => this.clear());
  }

  // set(), but only if `previous` is still the current session: a refresh answering after a
  // logout or a new login must not overwrite it (section 9.2).
  replace(previous: Session, next: Session): void {
    if (this.sessionSubject.getValue() === previous) this.set(next);
  }

  // With an argument, clears only if that session is still the current one: a rejection of an
  // old token must not sign out a newer session (sections 9.2 and 9.4).
  clear(only?: Session): void {
    const current = this.sessionSubject.getValue();
    if (only !== undefined && current !== only) return;
    this.expiry?.unsubscribe();
    this.expiry = undefined;
    if (current !== null) this.sessionSubject.next(null);
  }
}
