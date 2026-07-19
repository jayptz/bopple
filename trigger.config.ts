import { defineConfig } from '@trigger.dev/sdk/v3'
import { playwright } from '@trigger.dev/build/extensions/playwright'

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_ddguhcspqfxrwyyahktw',
  // Node 22 ships a native WebSocket global needed by supabase-js realtime.
  runtime: 'node-22',
  logLevel: 'log',
  // Room for the agent run PLUS install + dev-server boot + screenshot capture.
  maxDuration: 600,
  // Installing deps and running headless Chromium needs more than the default micro machine.
  machine: 'medium-1x',
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 2,
    },
  },
  build: {
    external: ['playwright', 'playwright-core'],
    extensions: [
      // Pin ≤1.57 — Playwright 1.58+ changed --dry-run output and breaks this extension.
      playwright({
        browsers: ['chromium'],
        headless: true,
        version: '1.57.0',
      }),
    ],
  },
  dirs: ['./trigger'],
})
