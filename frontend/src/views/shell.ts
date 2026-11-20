import type { Role } from '@shared-calendar/shared';
import { fromEvent, Subscription } from 'rxjs';
import { distinctUntilChanged, filter, map, startWith } from 'rxjs/operators';
import { AppointmentsScreen } from '../logic/appointments.screen';
import { AvailabilityScreen } from '../logic/availability.screen';
import { SettingsScreen } from '../logic/settings.screen';
import { UsersScreen } from '../logic/users.screen';
import { WeekScreen } from '../logic/week.screen';
import type { ApiConfig } from '../services/api';
import { AppointmentsService } from '../services/appointments.service';
import { AvailabilityRulesService } from '../services/availability-rules.service';
import { AvailabilityTypesService } from '../services/availability-types.service';
import { CalendarSettingsService } from '../services/calendar-settings.service';
import { CalendarService } from '../services/calendar.service';
import type { CognitoConfig } from '../services/cognito';
import { LoginService } from '../services/login.service';
import { RefreshService } from '../services/refresh.service';
import { SessionStore } from '../services/session.store';
import { UsersService } from '../services/users.service';
import { mountAppointments } from './appointments.view';
import { mountAvailability } from './availability.view';
import { mountLogin, type LoginDeps } from './login.view';
import { mountSettings } from './settings.view';
import { mountUsers } from './users.view';
import { mountWeek } from './week.view';

// The shell (docs/FRONTEND_ARCHITECTURE.md section 6): the start-up, the switch between the
// login and the frame of the application according to the session, and inside the frame the
// switch between the screens according to the address.

// The whole configuration, as the entry file hands it over: `cognitoUrl` and `clientId` for the
// login and the refresh, `apiUrl` for the API services of each session.
export type AppConfig = ApiConfig & CognitoConfig;

// Who is signed in, as the header and the views see it: never the Session, which holds the
// tokens (docs/FRONTEND_ARCHITECTURE.md section 3, rule 11).
export type Person = { username: string; role: Role };

export type ShellDeps = {
  config: ApiConfig; // where the API is, for the API services
  // The whole store: an API service reads the token from it at the moment of each call
  // (docs/FRONTEND_SERVICES.md section 2, rule 9). The shell itself uses `session$` and `clear`.
  store: SessionStore;
  login: LoginDeps;
  screens?: readonly Screen[]; // the table of screens; SCREENS unless a test brings its own
};

const ROLE_IN_WORDS: Record<Role, string> = { admin: 'Administrator', user: 'User' };

// What belongs to one person's session: the API services and the logic objects, created when
// the person enters and dropped when the person leaves, so that nothing of one person's data
// can be replayed to the next (docs/FRONTEND_ARCHITECTURE.md section 6, point 4).
// The role is there for the views that show a part to one role only. `week`, `list`,
// `settings`, `accounts` and `availability` are the logic objects of the five screens: the
// week, "My appointments", the settings, the users and the availability. `users` is the
// service the week's book dialog and the users screen share; `types` and `rules` are the two
// services of the availability, whose view calls their deletes.
export type SessionObjects = {
  role: Role;
  week: WeekScreen;
  list: AppointmentsScreen;
  settings: SettingsScreen;
  accounts: UsersScreen;
  availability: AvailabilityScreen;
  appointments: AppointmentsService;
  users: UsersService;
  types: AvailabilityTypesService;
  rules: AvailabilityRulesService;
};

function sessionObjects(config: ApiConfig, store: SessionStore, person: Person): SessionObjects {
  const calendar = new CalendarService(config, store);
  const appointments = new AppointmentsService(config, store);
  const users = new UsersService(config, store);
  // One service for the settings: the list screen and the availability screen read them for
  // the calendar's time zone, the settings screen reads and saves them.
  const calendarSettings = new CalendarSettingsService(config, store);
  // Notifies each time the page becomes visible again (the person comes back to the tab, or
  // brings the window back up): the screen on show then loads what it shows again, to show
  // what other people booked or cancelled in the meantime. The API cannot push, and nothing is
  // asked on a timer (docs/FRONTEND_VIEW_PLAN.md section 8, decision 11).
  const visible$ = fromEvent(document, 'visibilitychange').pipe(filter(() => document.visibilityState === 'visible'));
  const now = () => new Date();
  const week = new WeekScreen(calendar, appointments, person.role, now, visible$);
  // The list screen hands an appointment to move over to the week screen.
  const list = new AppointmentsScreen(calendarSettings, appointments, week, person.role, now, visible$);
  const settings = new SettingsScreen(calendarSettings);
  const accounts = new UsersScreen(users, visible$);
  const types = new AvailabilityTypesService(config, store);
  const rules = new AvailabilityRulesService(config, store);
  const availability = new AvailabilityScreen(calendarSettings, types, rules, now, visible$);
  return { role: person.role, week, list, settings, accounts, availability, appointments, users, types, rules };
}

// A screen of the application: its address (the URL's hash), its name in the navigation, the
// roles that may see it, its element in index.html, and how it is shown: the view is mounted on
// the element, then its logic object is started (docs/FRONTEND_ARCHITECTURE.md section 6,
// point 5). The subscription returned holds both.
export type Screen = {
  hash: string;
  label: string;
  roles: readonly Role[];
  element: string;
  show: (root: HTMLElement, objects: SessionObjects) => Subscription;
};

const WEEK_HASH = '#/week';

// The table of screens, in the order of the navigation. A role's first screen is the one shown
// for an empty, unknown or forbidden address.
export const SCREENS: readonly Screen[] = [
  {
    hash: WEEK_HASH,
    label: 'Week',
    roles: ['admin', 'user'],
    element: '#week',
    show: (root, { week, appointments, users, role }) => {
      const subscription = mountWeek(root, { screen: week, appointments, users, role });
      subscription.add(week.start());
      return subscription;
    },
  },
  {
    hash: '#/appointments',
    label: 'My appointments',
    roles: ['user'],
    element: '#appointments',
    show: (root, { list, appointments }) => {
      // The view is handed the way to the week, for an appointment it sends there to be moved:
      // a change of address, which the shell follows like any other.
      const showWeek = () => {
        window.location.hash = WEEK_HASH;
      };
      const subscription = mountAppointments(root, { screen: list, appointments, showWeek });
      subscription.add(list.start());
      return subscription;
    },
  },
  {
    hash: '#/settings',
    label: 'Settings',
    roles: ['admin'],
    element: '#settings',
    show: (root, { settings }) => {
      const subscription = mountSettings(root, settings);
      subscription.add(settings.start());
      return subscription;
    },
  },
  {
    hash: '#/users',
    label: 'Users',
    roles: ['admin'],
    element: '#users',
    show: (root, { accounts, users }) => {
      const subscription = mountUsers(root, { screen: accounts, users });
      subscription.add(accounts.start());
      return subscription;
    },
  },
  {
    hash: '#/availability',
    label: 'Availability',
    roles: ['admin'],
    element: '#availability',
    show: (root, { availability, types, rules }) => {
      const subscription = mountAvailability(root, { screen: availability, types, rules });
      subscription.add(availability.start());
      return subscription;
    },
  },
];

// The start-up, called once by the entry file: creates the store and the two services that live
// as long as the page, starts the automatic refresh (docs/FRONTEND_SERVICES.md section 11.6) and
// mounts the shell on the page.
export function runShell(config: AppConfig): Subscription {
  const store = new SessionStore();
  const login = new LoginService(config, store);
  const refresh = new RefreshService(config, store);
  refresh.start();
  const subscription = mountShell(document.body, { config, store, login });
  subscription.add(() => refresh.stop());
  return subscription;
}

// Shows the login or the frame at every change of person, and in the frame the screen of the
// address. `root` holds the elements #login and #app of index.html.
export function mountShell(root: HTMLElement, { config, store, login, screens: table = SCREENS }: ShellDeps): Subscription {
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const loginRoot = find('#login');
  const frame = find('#app');
  const username = find('#app .username');
  const role = find('#app .role');
  const nav = find('#app .nav');
  const linkTemplate = find<HTMLTemplateElement>('#tpl-nav-link');

  // "Sign out" only clears the store (docs/FRONTEND_ARCHITECTURE.md section 10, open point O7);
  // the screen changes because the session stream then notifies null.
  find('#app .sign-out').onclick = () => store.clear();

  // The frame for one person: the header and the navigation are filled here and emptied when
  // the person leaves, and whatever belongs to this person's session ends with the subscription
  // returned (docs/FRONTEND_ARCHITECTURE.md section 6, points 4 to 6).
  const enter = (person: Person): Subscription => {
    username.textContent = person.username;
    role.textContent = ROLE_IN_WORDS[person.role];
    const objects = sessionObjects(config, store, person);

    // The navigation: one link per screen this role may see.
    const screens = table.filter((screen) => screen.roles.includes(person.role));
    const links = screens.map((screen) => {
      const link = linkTemplate.content.firstElementChild!.cloneNode(true) as HTMLAnchorElement;
      link.href = screen.hash;
      link.textContent = screen.label;
      return link;
    });
    nav.replaceChildren(...links);

    // The screen on show, with its logic object.
    let shown: Subscription | undefined;

    // The address as a stream, from the one the page has now. An empty, unknown or forbidden
    // address is the role's first screen, and the address is put right in place, without a new
    // step in the browser's history: the back button does not come back to the wrong one.
    const session = fromEvent(window, 'hashchange')
      .pipe(
        startWith(null),
        map(() => {
          const hash = window.location.hash;
          const screen = screens.find((candidate) => candidate.hash === hash) ?? screens[0]!;
          if (hash !== screen.hash) window.history.replaceState(null, '', screen.hash);
          return screen;
        }),
        distinctUntilChanged(), // an address put right while its screen is on show changes nothing
      )
      .subscribe((screen) => {
        shown?.unsubscribe(); // leaves the screen before
        links.forEach((link, i) => {
          if (screens[i] === screen) link.setAttribute('aria-current', 'page');
          else link.removeAttribute('aria-current');
        });
        const element = find(screen.element);
        element.hidden = false;
        shown = screen.show(element, objects);
        shown.add(() => {
          element.hidden = true;
        });
      });

    session.add(() => {
      shown?.unsubscribe();
      nav.replaceChildren();
      username.textContent = '';
      role.textContent = '';
    });
    return session;
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
