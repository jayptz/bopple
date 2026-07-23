/**
 * Interrupt behavior tests (soft pause points + hard timeout constant).
 * Run: npx tsx scripts/test-interrupt.ts
 */
import {
  formatInterruptFeedback,
  HARD_INTERRUPT_MS,
  isStopCommand,
} from '../lib/interrupt'

let failed = 0

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`PASS  ${name}`)
  else {
    failed += 1
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\n--- Stop command recognition ---\n')
assert('stop', isStopCommand('stop'))
assert('/stop', isStopCommand('/stop'))
assert('STOP case', isStopCommand('  STOP  '))
assert('not stop mid sentence', !isStopCommand('please stop the server'))
assert('not stopword', !isStopCommand('stopped'))

console.log('\n--- Feedback copy ---\n')
{
  const before = formatInterruptFeedback(null, false)
  assert('before any tool', before.includes('before the next step'))
  assert('before soft not hard', !before.includes('hard'))

  const afterWrite = formatInterruptFeedback('write_file', false)
  assert('after write_file soft', afterWrite.includes('Stopped after write_file'))
  assert(
    'write soft implies complete file (no mid-write)',
    afterWrite.includes('after write_file') && !afterWrite.includes('while running')
  )

  const midInstall = formatInterruptFeedback('bash', true)
  assert('hard during bash', midInstall.includes('Stopped hard while running bash'))
}

console.log('\n--- Hard interrupt window ---\n')
assert(
  'HARD_INTERRUPT_MS is 45s',
  HARD_INTERRUPT_MS === 45_000,
  `got ${HARD_INTERRUPT_MS}`
)
console.log(
  '  Rationale: 45s lets short tools (read/write) finish cleanly after Stop;'
)
console.log(
  '  long npm install/build escalate to sandbox kill instead of hanging for minutes.'
)

console.log('\n--- Soft-interrupt sequencing model ---\n')
/**
 * Models the agent loop pause points without calling Anthropic/E2B.
 * Soft interrupt is only honored at boundaries (before/after tool), never mid-write.
 */
function simulateLoop(opts: {
  tools: string[]
  interruptBeforeIndex: number | null
}): { stoppedAfter: string | null; completed: string[] } {
  const completed: string[] = []
  let interruptArmed = opts.interruptBeforeIndex != null

  // Before any tool (task just started)
  if (interruptArmed && opts.interruptBeforeIndex === 0 && completed.length === 0) {
    return { stoppedAfter: null, completed }
  }

  for (let i = 0; i < opts.tools.length; i++) {
    // Soft check BEFORE tool i
    if (interruptArmed && opts.interruptBeforeIndex === i) {
      return { stoppedAfter: completed[completed.length - 1] ?? null, completed }
    }

    // Tool runs to completion (write_file is atomic in our model)
    const tool = opts.tools[i]
    completed.push(tool)

    // Soft check AFTER tool i — interrupt requested during this tool finishes first
    if (interruptArmed && opts.interruptBeforeIndex === i + 0.5) {
      return { stoppedAfter: tool, completed }
    }
  }
  return { stoppedAfter: null, completed }
}

{
  const pre = simulateLoop({
    tools: ['read_file', 'write_file', 'bash'],
    interruptBeforeIndex: 0,
  })
  assert('interrupt before any tool', pre.stoppedAfter === null && pre.completed.length === 0)
}

{
  // Interrupt requested while write_file is "in flight" → soft wait → stop AFTER write_file
  const midWrite = simulateLoop({
    tools: ['read_file', 'write_file', 'bash'],
    interruptBeforeIndex: 1.5,
  })
  assert(
    'interrupt mid write_file stops AFTER write_file (file complete)',
    midWrite.stoppedAfter === 'write_file' && midWrite.completed.includes('write_file')
  )
  assert('did not start bash after write interrupt', !midWrite.completed.includes('bash'))
}

{
  const midInstall = simulateLoop({
    tools: ['bash', 'write_file'],
    interruptBeforeIndex: 0.5,
  })
  assert(
    'interrupt during bash (install) soft-stops after bash returns',
    midInstall.stoppedAfter === 'bash'
  )
}

console.log(`\n${failed === 0 ? 'All interrupt tests passed.' : `${failed} test(s) failed.`}\n`)
process.exit(failed === 0 ? 0 : 1)
