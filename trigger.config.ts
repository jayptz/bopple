import { defineConfig } from '@trigger.dev/sdk/v3'
import { playwright } from '@trigger.dev/build/extensions/playwright'

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_ddguhcspqfxrwyyahktw',
  // Node 22 ships a native WebSocket global, which @supabase/supabase-js (2.110+)
  // requires when constructing its Realtime client inside createClient(). The
  // default 'node' runtime is 21.x and throws "native WebSocket not found".
  runtime: 'node-22',
  logLevel: 'log',
  // Room for the agent run PLUS install + dev-server boot + screenshot capture.
  maxDuration: 600,
  // Installing a full app's deps and running headless Chromium is CPU/memory
  // heavy; the default micro/small machine is why npm install kept timing out.
  machine: 'medium-1x',
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 2,
    },
  },
  build: {
    // Playwright ships native browser binaries and does a runtime require of
    // chromium-bidi, so it can't be bundled — leave it as an external require
    // resolved from node_modules at runtime.
    external: ['playwright', 'playwright-core'],
    // Bundles Chromium + its system deps into the deployed image so the
    // coding-agent task can screenshot preview apps. Only affects deploy, not dev.
    extensions: [playwright()],
  },
  dirs: ['./trigger'],
})
