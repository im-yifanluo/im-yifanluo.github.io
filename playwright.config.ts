// End-to-end tests (tests/e2e): Playwright drives a headless browser against the built site, which `astro preview`
// serves from dist/. The tests never build: run `npm run build` first.
//   E2E_PORT    the preview server's port (default 4329)
//   PW_CHANNEL  an installed browser to use, e.g. `chrome`; unset, Playwright's own Chromium (`npx playwright install`)
//   CI          skips the tests tagged @local: measured layout and type, and throttled loading, which depend on the
//               machine's fonts and speed
// A test tagged @desktop runs only in the desktop project (hover, the drawn diagrams, checks that are the same at every
// width) and one tagged @phone only in the phone project (touch, phone layouts).
import { defineConfig } from '@playwright/test';
import { deviceAt } from './tests/e2e/helpers/devices';

const port = Number(process.env.E2E_PORT ?? 4329);
const baseURL = `http://127.0.0.1:${port}`;
const ci = process.env.CI ? [/@local/] : [];

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    channel: process.env.PW_CHANNEL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: deviceAt(1440), grepInvert: [...ci, /@phone/] },
    { name: 'phone', use: deviceAt(390), grepInvert: [...ci, /@desktop/] },
  ],
  webServer: {
    // --ignore-lock: a server only these tests use, in the foreground, alongside any other preview (no lock file)
    command: `npm run preview -- --port ${port} --host 127.0.0.1 --ignore-lock`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
