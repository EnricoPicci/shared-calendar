import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

// The bundle's constants (frontend/scripts/bundle.mjs): a build for the cloud always signs a
// person out everywhere after a change of password; only the dev server's bundle, for the local
// stack, skips it (docs/FRONTEND_SERVICES.md section 8, decision 67). And only the dev server's
// bundle holds the padded test language (docs/MULTILANGUAGE_ARCHITECTURE.md section 6.3, rule 4).

const SCRIPTS = `${import.meta.dirname}/../../../scripts`;

type Options = { define: Record<string, string> } & Parameters<typeof build>[0];
type BundleModule = { bundleOptions: (config: Record<string, unknown>) => Options };
// A path held in a variable: the compiler does not look for types of a Node script.
const bundleFile = `${SCRIPTS}/bundle.mjs`;
const { bundleOptions } = (await import(bundleFile)) as BundleModule;

// The configuration build.mjs gives: its three environment variables and nothing else.
const BUILD_CONFIG = { API_URL: '/api', COGNITO_URL: 'https://cognito-idp.eu-north-1.amazonaws.com/', CLIENT_ID: 'client-123' };

describe('the bundle\'s constants', () => {
  it('build.mjs reads the three variables of the configuration and no fourth', () => {
    const source = readFileSync(`${SCRIPTS}/build.mjs`, 'utf8');
    expect(source).toContain("const NAMES = ['API_URL', 'COGNITO_URL', 'CLIENT_ID'];");
    expect(source).toContain('const config = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));');
    expect(source).not.toMatch(/SKIP_GLOBAL_SIGN_OUT\s*[:=]/);
  });

  it('with build.mjs\'s configuration the sign-out everywhere is not skipped', () => {
    expect(bundleOptions(BUILD_CONFIG).define.SKIP_GLOBAL_SIGN_OUT).toBe('false');
  });

  it('only exactly true skips it: a text "true" or 1 does not', () => {
    expect(bundleOptions({ ...BUILD_CONFIG, SKIP_GLOBAL_SIGN_OUT: true }).define.SKIP_GLOBAL_SIGN_OUT).toBe('true');
    for (const value of ['true', 1, 'yes', undefined]) expect(bundleOptions({ ...BUILD_CONFIG, SKIP_GLOBAL_SIGN_OUT: value }).define.SKIP_GLOBAL_SIGN_OUT).toBe('false');
  });

  it('the dev server gives true, for the local stack', () => {
    const source = readFileSync(`${SCRIPTS}/dev.mjs`, 'utf8');
    expect(source).toMatch(/CLIENT_ID: await clientId\(\), SKIP_GLOBAL_SIGN_OUT: true, TEST_LANGUAGE: true \}/);
  });

  it('the bundle built with build.mjs\'s configuration hands the shell skipGlobalSignOut false', async () => {
    const result = await build({ ...bundleOptions(BUILD_CONFIG), write: false });
    const text = result.outputFiles![0]!.text;
    expect(text).toMatch(/skipGlobalSignOut: false\b/);
    expect(text).not.toMatch(/skipGlobalSignOut: true/);
  }, 30_000);

  it('only exactly true offers the padded test language, which build.mjs never gives', () => {
    expect(bundleOptions(BUILD_CONFIG).define.TEST_LANGUAGE).toBe('false');
    expect(bundleOptions({ ...BUILD_CONFIG, TEST_LANGUAGE: true }).define.TEST_LANGUAGE).toBe('true');
    for (const value of ['true', 1, undefined]) expect(bundleOptions({ ...BUILD_CONFIG, TEST_LANGUAGE: value }).define.TEST_LANGUAGE).toBe('false');
    expect(readFileSync(`${SCRIPTS}/build.mjs`, 'utf8')).not.toMatch(/TEST_LANGUAGE\s*[:=]/);
  });

  // The mark that opens a padded text, as the bundle may hold it: the character, or its escape.
  const holdsMark = (text: string) => text.includes('\u27E6') || text.includes('\\u27E6') || /\\u27e6/i.test(text);

  it('the bundle built as npm run build builds it, minified, holds nothing of the padded test language', async () => {
    const result = await build({ ...bundleOptions(BUILD_CONFIG), minify: true, write: false });
    expect(holdsMark(result.outputFiles![0]!.text)).toBe(false);
  }, 30_000);

  it('the dev server\'s bundle holds it', async () => {
    const result = await build({ ...bundleOptions({ ...BUILD_CONFIG, TEST_LANGUAGE: true }), minify: true, write: false });
    expect(holdsMark(result.outputFiles![0]!.text)).toBe(true);
  }, 30_000);
});
