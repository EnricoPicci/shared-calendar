import type { Role } from '@shared-calendar/shared';
import { Subscription } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import type { ApiConfig } from '../services/api';
import type { CognitoConfig } from '../services/cognito';
import { LoginService } from '../services/login.service';
import { RefreshService } from '../services/refresh.service';
import { SessionStore } from '../services/session.store';
import { mountLogin, type LoginDeps } from './login.view';

// The shell (docs/FRONTEND_ARCHITECTURE.md section 6): the start-up, and the switch between the
// login and the frame of the application according to the session.

// The whole configuration, as the entry file hands it over: `cognitoUrl` and `clientId` for the
// login and the refresh, `apiUrl` for the API services (no screen calls the API, so nothing reads
// it here).
export type AppConfig = ApiConfig & CognitoConfig;

// Who is signed in, as the header and the views see it: never the Session, which holds the
// tokens (docs/FRONTEND_ARCHITECTURE.md section 3, rule 11).
export type Person = { username: string; role: Role };

export type ShellDeps = {
  store: Pick<SessionStore, 'session$' | 'clear'>;
  login: LoginDeps;
};

const ROLE_IN_WORDS: Record<Role, string> = { admin: 'Administrator', user: 'User' };

// The start-up, called once by the entry file: creates the store and the two services that live
// as long as the page, starts the automatic refresh (docs/FRONTEND_SERVICES.md section 11.6) and
// mounts the shell on the page.
export function runShell(config: AppConfig): Subscription {
  const store = new SessionStore();
  const login = new LoginService(config, store);
  const refresh = new RefreshService(config, store);
  refresh.start();
  const subscription = mountShell(document.body, { store, login });
  subscription.add(() => refresh.stop());
  return subscription;
}

// Shows the login or the frame at every change of person. `root` holds the elements #login and
// #app of index.html.
export function mountShell(root: HTMLElement, { store, login }: ShellDeps): Subscription {
  const find = (selector: string) => root.querySelector<HTMLElement>(selector)!;
  const loginRoot = find('#login');
  const frame = find('#app');
  const username = find('#app .username');
  const role = find('#app .role');

  // "Sign out" only clears the store (docs/FRONTEND_ARCHITECTURE.md section 10, open point O7);
  // the screen changes because the session stream then notifies null.
  find('#app .sign-out').onclick = () => store.clear();

  // The frame for one person: the header is filled here and emptied when the person leaves, and
  // whatever belongs to this person's session is added to the subscription returned
  // (docs/FRONTEND_ARCHITECTURE.md section 6, points 4 and 5).
  const enter = (person: Person): Subscription => {
    username.textContent = person.username;
    role.textContent = ROLE_IN_WORDS[person.role];
    return new Subscription(() => {
      username.textContent = '';
      role.textContent = '';
    });
  };

  // What is on screen: the login view, or one person's frame.
  let current: Subscription | undefined;

  const subscription = store.session$
    .pipe(
      // The tokens stop here: only the name and the role go further.
      map((session): Person | null => session && { username: session.username, role: session.role }),
      // A refreshed session is the same person: the screen stays as it is
      // (docs/FRONTEND_ARCHITECTURE.md section 6, point 3).
      distinctUntilChanged((a, b) => a?.username === b?.username && a?.role === b?.role),
    )
    .subscribe((person) => {
      current?.unsubscribe(); // leaves the login view or the previous person's frame
      loginRoot.hidden = person !== null;
      frame.hidden = person === null;
      current = person === null ? mountLogin(loginRoot, login) : enter(person);
    });

  // Ending the shell leaves whatever is on screen and hides both.
  subscription.add(() => {
    current?.unsubscribe();
    loginRoot.hidden = true;
    frame.hidden = true;
  });
  return subscription;
}
