import type { Role } from '@shared-calendar/shared';
import { fromEvent, merge, Subscription } from 'rxjs';
import { distinctUntilChanged, filter, map, startWith } from 'rxjs/operators';
import { AppointmentsScreen } from '../logic/appointments.screen';
import { AssistantScreen } from '../logic/assistant.screen';
import { AvailabilityScreen } from '../logic/availability.screen';
import { ChoosePasswordScreen } from '../logic/choose-password.screen';
import { DateScreen } from '../logic/date.screen';
import { DailyMailScreen } from '../logic/daily-mail.screen';
import { PageLanguage } from '../logic/language';
import { MailScreen } from '../logic/mail.screen';
import { MeScreen } from '../logic/me.screen';
import { PasswordScreen } from '../logic/password.screen';
import { SettingsScreen } from '../logic/settings.screen';
import { UsersScreen } from '../logic/users.screen';
import { WeekScreen } from '../logic/week.screen';
import { PAGE_TEXTS_EN } from '../texts/texts.en';
import type { FrameTexts, PageTexts } from '../texts/texts';
import type { ApiConfig } from '../services/api';
import { AppointmentsService } from '../services/appointments.service';
import { AssistantService } from '../services/assistant.service';
import { AvailabilityRulesService } from '../services/availability-rules.service';
import { AvailabilityTypesService } from '../services/availability-types.service';
import { CalendarSettingsService } from '../services/calendar-settings.service';
import { CalendarService } from '../services/calendar.service';
import { ChangePasswordService } from '../services/change-password.service';
import type { CognitoConfig } from '../services/cognito';
import { LoginService } from '../services/login.service';
import { LogoutService, type Resettable } from '../services/logout.service';
import { MailSettingsService } from '../services/mail-settings.service';
import { MailService } from '../services/mail.service';
import { RefreshService } from '../services/refresh.service';
import { SessionStore } from '../services/session.store';
import { MeService } from '../services/me.service';
import { UsersService } from '../services/users.service';
import { mountAppointments } from './appointments.view';
import { mountAssistant } from './assistant.view';
import { mountConfirm } from './availability.parts';
import { mountAvailability } from './availability.view';
import { mountChoosePassword, type ChoosePasswordDeps } from './choose-password.view';
import { mountDate } from './date.view';
import { mountLogin, type LoginDeps } from './login.view';
import { mountMe } from './me.view';
import { fillPage } from './page-texts';
import { mountPassword } from './password.view';
import { mountDailyMail, mountSettings } from './settings.view';
import { mountUsers } from './users.view';
import { mountWeek } from './week.view';

// The shell (docs/FRONTEND_ARCHITECTURE.md section 6): the start-up, the switch between the
// login and the frame of the application according to the session, and inside the frame the
// switch between the screens according to the address.

// The whole configuration, as the entry file hands it over: `cognitoUrl` and `clientId` for the
// login, the refresh and the sign-out, `apiUrl` for the API services of each session, and
// whether the change of a password skips the sign-out everywhere that follows it: true only
// against the local stack, whose Cognito emulator cannot do it (docs/FRONTEND_SERVICES.md
// section 8, decision 67). It is skipped only when `skipGlobalSignOut` is true, so that a
// configuration without it always signs out.
// `testLanguage`, given only by the development server's bundle, makes the padded test language
// out of the English texts; the page is then shown in it when its address asks for it with
// `?padded` (docs/MULTILANGUAGE_ARCHITECTURE.md section 6.3, rule 4).
export type AppConfig = ApiConfig & CognitoConfig & { skipGlobalSignOut?: boolean; testLanguage?: (english: PageTexts) => PageTexts };

// What the shell needs of the configuration for each session: the API's address for the API
// services, Cognito's and the skip value for the change of password.
export type ShellConfig = ApiConfig & Pick<CognitoConfig, 'cognitoUrl'> & { skipGlobalSignOut?: boolean };

// Who is signed in, as the header and the views see it: never the Session, which holds the
// tokens (docs/FRONTEND_ARCHITECTURE.md section 3, rule 11).
export type Person = { username: string; role: Role };

// What the shell uses of the LogoutService: its one method. No view reads how telling Cognito
// went (docs/FRONTEND_SERVICES.md section 8, decision 50).
export type LogoutDeps = Pick<LogoutService, 'logout'>;

export type ShellDeps = {
  config: ShellConfig; // where the API and Cognito are, for the services of each session
  // The page's language: the page is filled from its texts before anything is shown.
  language: PageLanguage;
  // The whole store: an API service reads the token from it at the moment of each call
  // (docs/FRONTEND_SERVICES.md section 2, rule 9). The shell itself uses `session$` only.
  store: SessionStore;
  login: LoginDeps;
  // "Choose your password", shown in the login's place while the LoginService asks for a new
  // password (docs/FRONTEND_ARCHITECTURE.md section 6): mounted and started with the login view,
  // ended with it. None unless given.
  choose?: ChoosePasswordDeps & Pick<ChoosePasswordScreen, 'start'>;
  logout: LogoutDeps;
  // The services that live as long as the page, put back to their first state after a change of
  // password as "Sign out" puts them back (docs/FRONTEND_SERVICES.md section 8, decision 53):
  // the LoginService and the RefreshService; none unless given.
  pageWide?: readonly Resettable[];
  screens?: readonly Screen[]; // the table of screens; SCREENS unless a test brings its own
};

// What belongs to one person's session: the API services and the logic objects, created when
// the person enters and dropped when the person leaves, so that nothing of one person's data
// can be replayed to the next (docs/FRONTEND_ARCHITECTURE.md section 6, point 4).
// The role is there for the views that show a part to one role only. `week`, `list`,
// `settings`, `accounts` and `availability` are the logic objects of the five screens: the
// week, "My appointments", the settings, the users and the availability; `date` is the
// availability's second logic object, for its part about a single date. `users` is the
// service the week's book dialog and the users screen share; `types` and `rules` are the two
// services of the availability, whose view calls their deletes. `assistant` is the logic object
// of the assistant's panel, which is no screen: it is mounted once for the session, beside
// whichever screen is on show. `mail` is the logic object of the week's "E-mail…" dialog. `me`
// is the logic object of "My details". `daily` is the logic object of the settings' "Daily e-mail".
// `password` is the
// logic object of the password screen, and `changes` the service it uses, whose success the
// shell also hears.
export type SessionObjects = {
  role: Role;
  // The page texts of the language in use, for the views that put words with data.
  texts: PageTexts;
  week: WeekScreen;
  list: AppointmentsScreen;
  settings: SettingsScreen;
  daily: DailyMailScreen;
  accounts: UsersScreen;
  availability: AvailabilityScreen;
  date: DateScreen;
  appointments: AppointmentsService;
  users: UsersService;
  types: AvailabilityTypesService;
  rules: AvailabilityRulesService;
  assistant: AssistantScreen;
  mail: MailScreen;
  me: MeScreen;
  password: PasswordScreen;
  changes: ChangePasswordService;
};

function sessionObjects(config: ShellConfig, store: SessionStore, person: Person, texts: PageTexts): SessionObjects {
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
  // The assistant's panel. A change it made is one more moment at which the screen on show
  // must load again: the screens are handed one stream for both, and none of them knows the
  // panel (docs/FRONTEND_ARCHITECTURE.md section 6.1). The panel is told the role, as the week
  // is, to say a refused change for it.
  const assistant = new AssistantScreen(new AssistantService(config, store), person.role, texts);
  const again$ = merge(visible$, assistant.changed$);
  const now = () => new Date();
  const week = new WeekScreen(calendar, appointments, person.role, now, again$, texts);
  // The list screen hands an appointment to move over to the week screen.
  const list = new AppointmentsScreen(calendarSettings, appointments, week, person.role, now, again$, texts);
  const settings = new SettingsScreen(calendarSettings, texts);
  // The settings' "Daily e-mail": the daily mail's settings through a service of their own, and
  // the calendar's time zone from what the settings screen reads (docs/EMAIL_ARCHITECTURE.md
  // section 11).
  const daily = new DailyMailScreen(new MailSettingsService(config, store), calendarSettings, texts);
  const accounts = new UsersScreen(users, again$, texts);
  const types = new AvailabilityTypesService(config, store);
  const rules = new AvailabilityRulesService(config, store);
  const availability = new AvailabilityScreen(calendarSettings, types, rules, now, again$, texts);
  // The part about a single date reads the calendar view of that one date through a
  // CalendarService of its own: the service has one pair of streams and one pending call, and
  // the week's must keep the week (docs/FRONTEND_SERVICES.md section 18). What the
  // availability screen knows (the time zone, the types, the patterns) is handed over.
  const date = new DateScreen(availability.known$, new CalendarService(config, store), types, rules, now, again$, texts);
  // The person's own facts: read through GET /me, the Administrator's saved through the users
  // service, the one the users screen uses (docs/EMAIL_ARCHITECTURE.md section 9.1).
  const me = new MeScreen(new MeService(config, store), users, person.role, again$, texts);
  // The week's "E-mail…" dialog, with a MeService of its own: it reads the person's address once
  // a mail is asked for, and "My details" must not hear that read as its own.
  const mail = new MailScreen(new MailService(config, store), new MeService(config, store), person.role, texts);
  // The change of the person's own password, straight at Cognito (docs/FRONTEND_SERVICES.md
  // section 22).
  const changes = new ChangePasswordService({ cognitoUrl: config.cognitoUrl, skipGlobalSignOut: config.skipGlobalSignOut === true }, store);
  const password = new PasswordScreen(changes, texts);
  return { role: person.role, texts, week, list, settings, daily, accounts, availability, date, appointments, users, types, rules, assistant, mail, me, password, changes };
}

// A screen of the application: its address (the URL's hash), its name in the navigation, the
// roles that may see it, its element in index.html, and how it is shown: the view is mounted on
// the element, then its logic object is started (docs/FRONTEND_ARCHITECTURE.md section 6,
// point 5). The subscription returned holds both.
export type Screen = {
  hash: string;
  label: (frame: FrameTexts) => string;
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
    label: (frame) => frame.nav.week,
    roles: ['admin', 'user'],
    element: '#week',
    show: (root, { week, appointments, users, mail, role, texts }) => {
      const subscription = mountWeek(root, { screen: week, appointments, users, mail, role, texts });
      subscription.add(week.start());
      subscription.add(mail.start());
      return subscription;
    },
  },
  {
    hash: '#/appointments',
    label: (frame) => frame.nav.appointments,
    roles: ['user'],
    element: '#appointments',
    show: (root, { list, appointments, texts }) => {
      // The view is handed the way to the week, for an appointment it sends there to be moved:
      // a change of address, which the shell follows like any other.
      const showWeek = () => {
        window.location.hash = WEEK_HASH;
      };
      const subscription = mountAppointments(root, { screen: list, appointments, showWeek, texts });
      subscription.add(list.start());
      return subscription;
    },
  },
  {
    hash: '#/settings',
    label: (frame) => frame.nav.settings,
    roles: ['admin'],
    element: '#settings',
    // The settings screen reads once, when it is shown, and has nothing to load again on. When
    // the assistant made a change while it is on show, it is started afresh: the form is filled
    // with what the server holds, and values typed and not saved are gone, as on leaving. Its part
    // "Daily e-mail" is mounted and started beside it, after it, so that it hears the time zone
    // the settings read; the assistant changes nothing of the mail, so the part is not restarted.
    show: (root, { settings, daily, assistant, texts }) => {
      const subscription = mountSettings(root, settings, texts);
      subscription.add(mountDailyMail(root, daily, texts));
      let started = settings.start();
      subscription.add(daily.start());
      subscription.add(
        assistant.changed$.subscribe(() => {
          started.unsubscribe();
          started = settings.start();
        }),
      );
      subscription.add(() => started.unsubscribe());
      return subscription;
    },
  },
  {
    hash: '#/users',
    label: (frame) => frame.nav.users,
    roles: ['admin'],
    element: '#users',
    show: (root, { accounts, users, texts }) => {
      const subscription = mountUsers(root, { screen: accounts, users, texts });
      subscription.add(accounts.start());
      return subscription;
    },
  },
  {
    hash: '#/availability',
    label: (frame) => frame.nav.availability,
    roles: ['admin'],
    element: '#availability',
    // One screen, two views and two logic objects: the types and the patterns, and a single
    // date. Both views open the one dialog that confirms, mounted here and handed to each.
    // The availability screen is started first: its three reads leave, and the object of a
    // single date, which reads nothing until a date is shown, then takes what it knows.
    show: (root, { availability, date, types, rules, texts }) => {
      const confirm = mountConfirm(root);
      const subscription = mountAvailability(root, { screen: availability, types, rules, confirm, texts });
      subscription.add(mountDate(root, { screen: date, confirm }));
      subscription.add(confirm.subscription);
      subscription.add(availability.start());
      subscription.add(date.start());
      return subscription;
    },
  },
  {
    // For both roles, just before the password: each person reads their own facts; the
    // Administrator also changes them (docs/EMAIL_ARCHITECTURE.md section 11).
    hash: '#/me',
    label: (frame) => frame.nav.me,
    roles: ['admin', 'user'],
    element: '#me',
    show: (root, { me }) => {
      const subscription = mountMe(root, me);
      subscription.add(me.start());
      return subscription;
    },
  },
  {
    // Last in the navigation, for both roles: each person changes their own password, and only
    // theirs (docs/CHANGE_PASSWORD_PLAN.md section 2, decisions D1 and D3).
    hash: '#/password',
    label: (frame) => frame.nav.password,
    roles: ['admin', 'user'],
    element: '#password',
    show: (root, { password }) => {
      const subscription = mountPassword(root, password);
      subscription.add(password.start());
      return subscription;
    },
  },
];

// The start-up, called once by the entry file: creates the store and the three services that
// live as long as the page, starts the automatic refresh (docs/FRONTEND_SERVICES.md section
// 11.6) and mounts the shell on the page. The sign-out service is given the other two, which it
// puts back to their first state at a sign-out. It is not ended with the shell: a request that
// tells Cognito of a sign-out ends by itself (docs/FRONTEND_SERVICES.md section 8, decision 48).
export function runShell(config: AppConfig): Subscription {
  // English, or the padded test language when the development server's page asks for it.
  const padded = config.testLanguage !== undefined && window.location.search === '?padded';
  const language = new PageLanguage({ language: 'en', texts: padded ? config.testLanguage!(PAGE_TEXTS_EN) : PAGE_TEXTS_EN });
  const store = new SessionStore();
  const login = new LoginService(config, store);
  const refresh = new RefreshService(config, store);
  const logout = new LogoutService(config, store, [login, refresh]);
  // Lives as long as the page, as the LoginService it follows does.
  const choose = new ChoosePasswordScreen(login, language.state.texts);
  refresh.start();
  const subscription = mountShell(document.body, { config, language, store, login, choose, logout, pageWide: [login, refresh] });
  subscription.add(() => refresh.stop());
  return subscription;
}

// Shows the login or the frame at every change of person, and in the frame the screen of the
// address. `root` holds the elements #login and #app of index.html.
export function mountShell(root: HTMLElement, { config, language, store, login, choose, logout, pageWide = [], screens: table = SCREENS }: ShellDeps): Subscription {
  const { texts } = language.state;
  fillPage(root.ownerDocument, texts.html, language.state.language);
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const loginRoot = find('#login');
  const frame = find('#app');
  const username = find('#app .username');
  const role = find('#app .role');
  const nav = find('#app .nav');
  const linkTemplate = find<HTMLTemplateElement>('#tpl-nav-link');
  const panel = find('#assistant');

  // "Sign out" calls the service and nothing else (docs/FRONTEND_ARCHITECTURE.md section 6,
  // point 2): the service clears the store during the call, and the screen changes because the
  // session stream then notifies null. Cognito is told after, and its answer is shown nowhere.
  find('#app .sign-out').onclick = () => logout.logout();

  // What the login says the next time it is shown: "Password changed" after a change, set below
  // and given to the login view once.
  let notice = '';

  // The frame for one person: the header and the navigation are filled here and emptied when
  // the person leaves, and whatever belongs to this person's session ends with the subscription
  // returned (docs/FRONTEND_ARCHITECTURE.md section 6, points 4 to 6).
  const enter = (person: Person): Subscription => {
    username.textContent = person.username;
    role.textContent = texts.frame.roles[person.role];
    const objects = sessionObjects(config, store, person, texts);

    // The navigation: one link per screen this role may see.
    const screens = table.filter((screen) => screen.roles.includes(person.role));
    const links = screens.map((screen) => {
      const link = linkTemplate.content.firstElementChild!.cloneNode(true) as HTMLAnchorElement;
      link.href = screen.hash;
      link.textContent = screen.label(texts.frame);
      return link;
    });
    nav.replaceChildren(...links);

    // The assistant's panel is no screen: it has no address and no link, and is mounted here,
    // once, for as long as the person is signed in, whichever screens are shown meanwhile. View
    // first, then its logic object, as for a screen (docs/FRONTEND_ARCHITECTURE.md section 3,
    // rule 8).
    panel.hidden = false;
    const assistant = mountAssistant(panel, objects.assistant);
    assistant.add(objects.assistant.start());

    // A change of password that succeeded. The service says so before it clears the store, so
    // this runs while the person is still signed in: the page-wide services are put back to their
    // first state, as at a sign-out, and the login shown a moment later says "Password changed"
    // (docs/FRONTEND_ARCHITECTURE.md section 6). The service is the session's own, created just
    // above: its result stream has nothing earlier to replay.
    const changed = objects.changes.changePasswordResult$.pipe(filter((result) => result.status === 'success')).subscribe(() => {
      pageWide.forEach((service) => service.reset());
      notice = texts.password.changed;
    });

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
      changed.unsubscribe();
      assistant.unsubscribe();
      panel.hidden = true;
      nav.replaceChildren();
      username.textContent = '';
      role.textContent = '';
    });
    return session;
  };

  // The login view, with "Choose your password" beside it when given: view first, then its logic
  // object (docs/FRONTEND_ARCHITECTURE.md section 3, rule 8).
  const showLogin = (): Subscription => {
    const shown = mountLogin(loginRoot, login, texts, notice);
    if (choose) {
      shown.add(mountChoosePassword(loginRoot, choose));
      shown.add(choose.start());
    }
    return shown;
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
      current = person === null ? showLogin() : enter(person);
      notice = ''; // said once
    });

  // Ending the shell leaves whatever is on screen and hides both.
  subscription.add(() => {
    current?.unsubscribe();
    loginRoot.hidden = true;
    frame.hidden = true;
  });
  return subscription;
}
