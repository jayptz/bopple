/**
 * Soft interrupt helpers for running agent tasks.
 *
 * Soft stop: set interrupt_requested_at; agent finishes the current tool, then
 * pauses (awaiting_feedback) before the next tool call.
 *
 * Hard stop: if the in-flight tool does not return within HARD_INTERRUPT_MS
 * after the flag is set, kill the sandbox. 45s balances giving short tools
 * (read/write/list) time to finish cleanly vs not leaving the user stuck on
 * multi-minute npm install/build.
 */

export const HARD_INTERRUPT_MS = 45_000

export class HardInterruptError extends Error {
  readonly toolName: string
  readonly waitedMs: number

  constructor(toolName: string, waitedMs: number) {
    super(
      `Hard interrupt: killed sandbox while "${toolName}" was still running after ${waitedMs}ms`
    )
    this.name = 'HardInterruptError'
    this.toolName = toolName
    this.waitedMs = waitedMs
  }
}

export function isStopCommand(text: string): boolean {
  const t = text.trim().toLowerCase()
  return t === 'stop' || t === '/stop'
}

export function formatInterruptFeedback(toolName: string | null, hard: boolean): string {
  if (hard) {
    return toolName
      ? `Stopped hard while running ${toolName} (command did not finish in time). Reply here to continue on this task, or send a new task/repo name to start something else.`
      : `Stopped hard (sandbox killed). Reply here to continue on this task, or send a new task/repo name to start something else.`
  }
  return toolName
    ? `Stopped after ${toolName}. Reply here to continue on this task, or send a new task/repo name to start something else.`
    : `Stopped before the next step. Reply here to continue on this task, or send a new task/repo name to start something else.`
}
