import { Template, defaultBuildLogger } from 'e2b'
import { template } from './template'

/**
 * Builds the high-memory sandbox template used by Bopple agent jobs.
 *
 * Requires E2B_API_KEY in the environment.
 * Run: npm run build:sandbox
 */
async function main() {
  const buildInfo = await Template.build(template, 'bopple-heavy', {
    cpuCount: 2,
    memoryMB: 4096,
    onBuildLogs: defaultBuildLogger(),
  })

  console.log('\nTemplate build succeeded:')
  console.log(JSON.stringify(buildInfo, null, 2))
}

main().catch((error) => {
  console.error('Template build failed:', error)
  process.exit(1)
})
