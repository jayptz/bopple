import { defineConfig } from '@trigger.dev/sdk/v3'

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_ddguhcspqfxrwyyahktw',
  runtime: 'node',
  logLevel: 'log',
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 2,
    },
  },
  dirs: ['./trigger'],
})
