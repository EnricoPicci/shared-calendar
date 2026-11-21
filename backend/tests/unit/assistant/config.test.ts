// The core reads its configuration once per container: each test loads a fresh copy.
type Config = typeof import('../../../src/assistant/config');

async function load(env: { timeZone?: string; limit?: string } = {}): Promise<Config> {
  vi.stubEnv('CALENDAR_TIME_ZONE', env.timeZone ?? 'Europe/Rome');
  vi.stubEnv('ASSISTANT_DAILY_MESSAGE_LIMIT', env.limit ?? '');
  vi.resetModules();
  return import('../../../src/assistant/config');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('coreConfig', () => {
  it('gives the time zone and the daily limit of the deployment', async () => {
    const { coreConfig } = await load({ limit: '12' });
    expect(coreConfig()).toEqual({ timeZone: 'Europe/Rome', dailyMessageLimit: 12 });
  });

  it('takes the default of the shared limits (4.4) when the variable is empty', async () => {
    const { coreConfig } = await load();
    expect(coreConfig().dailyMessageLimit).toBe(30);
  });

  it.each(['', 'Mars/Phobos'])('refuses the time zone %j as a broken deployment', async (timeZone) => {
    const { coreConfig } = await load({ timeZone });
    expect(() => coreConfig()).toThrow(expect.objectContaining({ name: 'CoreConfigError' }));
  });

  it.each(['0', '-3', '2.5', 'many'])('refuses the daily limit %s', async (limit) => {
    const { coreConfig } = await load({ limit });
    expect(() => coreConfig()).toThrow(expect.objectContaining({ name: 'CoreConfigError', message: expect.stringContaining('ASSISTANT_DAILY_MESSAGE_LIMIT') }));
  });

  it('reads the environment once and keeps a failure too', async () => {
    const good = await load();
    good.coreConfig();
    vi.stubEnv('CALENDAR_TIME_ZONE', 'Mars/Phobos');
    expect(good.coreConfig().timeZone).toBe('Europe/Rome');

    const broken = await load({ timeZone: 'Mars/Phobos' });
    expect(() => broken.coreConfig()).toThrow();
    vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
    expect(() => broken.coreConfig()).toThrow();
  });
});
