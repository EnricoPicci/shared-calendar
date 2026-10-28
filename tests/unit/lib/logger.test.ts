import { log } from '../../../src/lib/logger';

function captureLines(run: () => void): string[] {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    run();
    return write.mock.calls.map(([chunk]) => String(chunk));
  } finally {
    write.mockRestore();
  }
}

describe('log', () => {
  it('writes one JSON line with timestamp, level, requestId and the fields', () => {
    const lines = captureLines(() => log('info', { requestId: 'req-1', route: 'POST /hello', durationMs: 12 }));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.endsWith('\n')).toBe(true);
    expect(lines[0]!.trimEnd()).not.toContain('\n');
    const line = JSON.parse(lines[0]!);
    expect(line).toEqual({
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      level: 'info',
      requestId: 'req-1',
      route: 'POST /hello',
      durationMs: 12,
    });
  });

  it('redacts password, authorization and token fields at any depth, case-insensitively', () => {
    const [raw] = captureLines(() =>
      log('warn', {
        requestId: 'req-1',
        password: 'Secret-Pass-1!',
        headers: { Authorization: 'Bearer abc', 'x-other': 'kept' },
        body: { username: 'bob', Password: 'Secret-Pass-2!' },
        list: [{ accessToken: 'eyJ...' }],
      }),
    );
    expect(raw).not.toContain('Secret-Pass');
    expect(raw).not.toContain('Bearer abc');
    expect(raw).not.toContain('eyJ');
    expect(JSON.parse(raw!)).toMatchObject({
      password: '[REDACTED]',
      headers: { Authorization: '[REDACTED]', 'x-other': 'kept' },
      body: { username: 'bob', Password: '[REDACTED]' },
      list: [{ accessToken: '[REDACTED]' }],
    });
  });

  it('keeps the name and message of an Error, without the stack', () => {
    const [raw] = captureLines(() => log('error', { requestId: 'req-1', err: new TypeError('boom') }));
    expect(JSON.parse(raw!).err).toEqual({ name: 'TypeError', message: 'boom' });
  });

  it('passes null and primitive values through', () => {
    const [raw] = captureLines(() => log('debug', { requestId: 'req-1', a: null, b: true, c: 'x' }));
    expect(JSON.parse(raw!)).toMatchObject({ level: 'debug', a: null, b: true, c: 'x' });
  });
});
