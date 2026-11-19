// The browser's zone for the tests of the logic layer: far from every calendar zone they use,
// so that a date or a time read in the machine's own zone would show as a wrong result
// (docs/FRONTEND_ARCHITECTURE.md section 5, rule 6). A helper, not a test file. Each test file
// runs in a process of its own, so the change stays in the file that asks for it.
export const BROWSER_ZONE = 'Pacific/Kiritimati'; // UTC+14, no daylight saving time

export function useFarBrowserZone(): void {
  process.env.TZ = BROWSER_ZONE;
  // Proof that the change took: the machine's own clock is 14 hours ahead of UTC.
  it('runs with a browser zone 14 hours ahead of UTC', () => {
    expect(new Date(Date.UTC(2026, 10, 16)).getTimezoneOffset()).toBe(-14 * 60);
    expect(new Date('2026-11-16T12:00:00Z').getDate()).toBe(17);
  });
}
