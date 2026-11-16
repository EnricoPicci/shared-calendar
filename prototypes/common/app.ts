import type { Subscription } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import type { Role } from '@shared-calendar/shared';
import { AppointmentsService } from '../../frontend/src/services/appointments.service';
import { CalendarService } from '../../frontend/src/services/calendar.service';
import { LoginService } from '../../frontend/src/services/login.service';
import { RefreshService } from '../../frontend/src/services/refresh.service';
import { SessionStore } from '../../frontend/src/services/session.store';
import { UsersService } from '../../frontend/src/services/users.service';
import { WeekScreen } from './logic';

// The start-up and the shell, the same for both prototypes: the services are created here, and
// the shell shows the login view or the calendar view according to the session. Each prototype
// brings only its two mount functions.

// Put in the bundle by serve.mjs, from backend/env.local.json.
declare const CLIENT_ID: string;

// What the calendar view receives.
export type CalendarDeps = {
  session: { username: string; role: Role };
  screen: WeekScreen;
  appointments: AppointmentsService;
  users: UsersService;
  signOut: () => void;
};

export type Views = {
  mountLogin: (root: HTMLElement, login: LoginService) => Subscription;
  mountCalendar: (root: HTMLElement, deps: CalendarDeps) => Subscription;
};

export function runShell(views: Views): void {
  // The page, the API and Cognito share one origin: serve.mjs passes /api and /cognito on to the
  // local stack, which answers no cross-origin request (docs/FRONTEND_SERVICES.md section 10.3).
  const cognito = { cognitoUrl: `${location.origin}/cognito/`, clientId: CLIENT_ID };
  const api = { apiUrl: `${location.origin}/api` };

  const store = new SessionStore();
  const login = new LoginService(cognito, store);
  new RefreshService(cognito, store).start();

  const loginRoot = document.querySelector<HTMLElement>('#login')!;
  const calendarRoot = document.querySelector<HTMLElement>('#calendar')!;
  let mounted: Subscription | undefined;

  store.session$
    // A refreshed session is the same person: the view stays as it is.
    .pipe(distinctUntilChanged((a, b) => a?.username === b?.username && a?.role === b?.role))
    .subscribe((session) => {
      mounted?.unsubscribe();
      loginRoot.hidden = session !== null;
      calendarRoot.hidden = session === null;
      if (session === null) {
        mounted = views.mountLogin(loginRoot, login);
        return;
      }
      // New services for every session: nothing of the previous person's data can be replayed.
      const calendar = new CalendarService(api, store);
      const appointments = new AppointmentsService(api, store);
      const users = new UsersService(api, store);
      const screen = new WeekScreen(calendar, appointments, session.role);
      mounted = views.mountCalendar(calendarRoot, {
        session: { username: session.username, role: session.role },
        screen,
        appointments,
        users,
        signOut: () => store.clear(),
      });
      // Subscribe first, then call: the first loads start once the view is mounted.
      mounted.add(screen.start());
      if (session.role === 'admin') users.listUsers(); // for the "book for" list
    });
}
