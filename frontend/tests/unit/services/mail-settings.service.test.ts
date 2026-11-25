import { MailSettingsService } from '../../../src/services/mail-settings.service';
import { json } from './fixtures';
import { CONFIG, describeMethod, type MethodSpec } from './suite';

// docs/FRONTEND_SERVICES.md section 25: the per-method suite of suite.ts for both methods, and the
// settings checked with the shared rule before a save is sent.

const SETTINGS = { dailyEnabled: true, dailyHour: 7 };
const INPUT = { dailyEnabled: false, dailyHour: 18 };

type S = MailSettingsService;
const make = (store: ConstructorParameters<typeof MailSettingsService>[1]) => new MailSettingsService(CONFIG, store);

const getSettings: MethodSpec<S> = {
  name: 'getSettings',
  result$: (s) => s.settingsResult$,
  state$: (s) => s.settingsState$,
  call: (s) => s.getSettings(),
  pending: { status: 'pending' },
  request: { method: 'GET', path: '/mail/settings' },
  ok: () => json(200, { ...SETTINGS, extra: 'ignored' }),
  success: { status: 'success', settings: SETTINGS },
  wrong: [
    ['200 without the hour', () => json(200, { dailyEnabled: true })],
    ['200 with the switch as text', () => json(200, { dailyEnabled: 'true', dailyHour: 7 })],
    ['201 with the settings', () => json(201, SETTINGS)],
    ['200 empty', () => new Response(null, { status: 200 })],
  ],
  codes: ['forbidden', 'mail_unavailable', 'internal_error'],
  notCodes: ['invalid_request', 'mail_limit_reached'],
};

const updateSettings: MethodSpec<S> = {
  name: 'updateSettings',
  result$: (s) => s.updateResult$,
  state$: (s) => s.updateState$,
  call: (s) => s.updateSettings(INPUT),
  pending: { status: 'pending', settings: INPUT },
  request: { method: 'PUT', path: '/mail/settings', body: INPUT },
  ok: () => json(200, INPUT),
  success: { status: 'success', settings: INPUT },
  wrong: [
    ['200 without the switch', () => json(200, { dailyHour: 18 })],
    ['204', () => new Response(null, { status: 204 })],
  ],
  codes: ['forbidden', 'invalid_json', 'invalid_request', 'mail_unavailable', 'internal_error'],
  notCodes: ['concurrent_update', 'no_email_address'],
  invalid: [
    ['an hour of 24', (s) => s.updateSettings({ dailyEnabled: true, dailyHour: 24 }), 'dailyHour: Too big: expected number to be <=23'],
    ['an hour that is not whole', (s) => s.updateSettings({ dailyEnabled: true, dailyHour: 6.5 }), 'dailyHour: Invalid input: expected int, received number'],
  ],
};

describe('MailSettingsService', () => {
  describeMethod(make, getSettings, updateSettings);
  describeMethod(make, updateSettings, getSettings);
});
