import Anthropic from '@anthropic-ai/sdk'
import { FileType } from 'e2b'
import type { SandboxSession } from './sandbox'
import {
  listRepoDir,
  readRepoFile,
  runInRepo,
  writeRepoFile,
} from './sandbox'

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentRunResult {
  messages: AgentMessage[]
  prTitle: string
  prBody: string
  summary: string
  needsFeedback: boolean
  feedbackPrompt: string | null
  /** Route to capture when the user asked for a screenshot; otherwise null. */
  screenshotRoute: string | null
}

const MAX_TURNS = 30

const tools: Anthropic.Tool[] = [
  {
    name: 'bash',
    description: 'Run a shell command in the repository root. Use for installs, tests, builds, grepping.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to run' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read a file relative to the repository root.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write or overwrite a file relative to the repository root.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
        content: { type: 'string', description: 'Full file content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a directory relative to the repository root.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative directory path, default "."' },
      },
      required: ['path'],
    },
  },
  {
    name: 'ask_user',
    description:
      'Pause and ask the user a question when requirements are unclear or you need a decision.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Question for the user' },
      },
      required: ['question'],
    },
  },
  {
    name: 'take_screenshot',
    description:
      'Request a screenshot of the running app to send back to the user. ONLY call this when the user explicitly asks to see a screenshot / preview / visual of the change. The screenshot is captured automatically after the build — you do not need to start any server yourself. Call it after you have made the visual change.',
    input_schema: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          description: 'Route/path to capture, e.g. "/" or "/login". Defaults to "/".',
        },
      },
      required: [],
    },
  },
  {
    name: 'complete_task',
    description: 'Call when the coding task is finished and ready for commit.',
    input_schema: {
      type: 'object',
      properties: {
        pr_title: { type: 'string' },
        pr_body: { type: 'string' },
        summary: { type: 'string' },
      },
      required: ['pr_title', 'pr_body', 'summary'],
    },
  },
]

const systemPromptBase = `You are Bopple, a friendly expert software engineer working inside a Linux VM with a git repository cloned at /home/user/repo.

You talk like a helpful teammate over chat — short, first-person, natural. Before every tool call, write 1 short sentence narrating what you're about to do (this text is shown to the user as a live progress update). Never use emojis.

Good narration examples:
- "Let me check the existing project structure first."
- "I'll open the homepage component and see how posts are listed."
- "Making the change now — adding the empty HackTheSix post."
- "Quick sanity check that nothing else broke."

Avoid robotic status logs like "Reading file X" or "Executing tool". Sound human.

Your job:
1. Explore the repo with list_files and read_file
2. Implement the user's task with write_file and bash (install deps, run tests)
3. Verify your work when possible (run tests/build)
4. Call complete_task when done with PR title/body/summary
5. Call ask_user only when you truly need a decision from the user

Rules:
- Always narrate in first person before tool calls (1 sentence, conversational)
- Work only inside the repository
- Write production-quality code matching existing patterns
- Prefer small, focused changes
- Run tests if they exist
- If the user asks for a screenshot / preview / to "see what it looks like", you MUST call take_screenshot (usually route "/") BEFORE complete_task. Do not skip it.
- When a reference image is attached, treat it as the visual target — match layout, spacing, colors, and typography as closely as the codebase allows
- When the user sends follow-up feedback (e.g. "make it shorter"), treat it as continuing the SAME task and branch — refine what you already did, don't start over
- Never commit or push — that happens automatically after you call complete_task`

const followUpSystemAddon = `

Follow-up mode: the user is continuing an existing task with new feedback. Your FIRST reply must briefly acknowledge what they asked for in plain conversational language before any tool work — e.g. "Got it, let me shrink that down" or "Makes sense, checking what's causing that now". Do not jump straight into reading files or tool narration with no acknowledgment of their message.`

async function executeTool(
  session: SandboxSession,
  name: string,
  input: Record<string, unknown>
): Promise<{
  output: string
  needsFeedback?: boolean
  completed?: AgentRunResult
  screenshotRoute?: string
}> {
  switch (name) {
    case 'bash': {
      const command = String(input.command ?? '')
      const result = await runInRepo(session, command, undefined, { allowNonZero: true })
      const output = [
        `exit code: ${result.exitCode}`,
        result.stdout ? `stdout:\n${result.stdout.slice(0, 8000)}` : '',
        result.stderr ? `stderr:\n${result.stderr.slice(0, 4000)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      return { output }
    }
    case 'read_file': {
      const path = String(input.path ?? '')
      try {
        const content = await readRepoFile(session, path)
        return { output: content.slice(0, 12000) }
      } catch {
        return { output: `Error: could not read ${path}` }
      }
    }
    case 'write_file': {
      const path = String(input.path ?? '')
      const content = String(input.content ?? '')
      await writeRepoFile(session, path, content)
      return { output: `Wrote ${path} (${content.length} bytes)` }
    }
    case 'list_files': {
      const path = String(input.path ?? '.')
      try {
        const entries = await listRepoDir(session, path)
        const names = entries
          .map((e) => `${e.type === FileType.DIR ? 'd' : 'f'} ${e.name}`)
          .join('\n')
        return { output: names || '(empty)' }
      } catch {
        return { output: `Error: could not list ${path}` }
      }
    }
    case 'take_screenshot': {
      const raw = String(input.route ?? '/').trim() || '/'
      const route = raw.startsWith('/') ? raw : `/${raw}`
      return {
        output: `Screenshot of ${route} queued — it is captured and sent automatically after the build completes.`,
        screenshotRoute: route,
      }
    }
    case 'ask_user': {
      const question = String(input.question ?? 'Need your input to continue.')
      return {
        output: question,
        needsFeedback: true,
        completed: {
          messages: [],
          prTitle: '',
          prBody: '',
          summary: question,
          needsFeedback: true,
          feedbackPrompt: question,
          screenshotRoute: null,
        },
      }
    }
    case 'complete_task': {
      return {
        output: 'Task marked complete.',
        completed: {
          messages: [],
          prTitle: String(input.pr_title ?? 'Bopple changes'),
          prBody: String(input.pr_body ?? ''),
          summary: String(input.summary ?? 'Task completed'),
          needsFeedback: false,
          feedbackPrompt: null,
          screenshotRoute: null,
        },
      }
    }
    default:
      return { output: `Unknown tool: ${name}` }
  }
}

export async function runAgentLoop(params: {
  session: SandboxSession
  prompt: string
  model: string
  apiKey: string
  priorMessages?: AgentMessage[]
  /** Raw base64 (no data-URL prefix) of a UI reference screenshot. */
  referenceImageBase64?: string | null
  referenceImageMediaType?: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  onToolCall?: (toolName: string, input: Record<string, unknown>) => void | Promise<void>
  /** Fired when the model narrates before tools — use for Telegram/dashboard progress. */
  onNarration?: (text: string) => void | Promise<void>
}): Promise<AgentRunResult> {
  const {
    session,
    prompt,
    model,
    apiKey,
    priorMessages = [],
    referenceImageBase64,
    referenceImageMediaType = 'image/jpeg',
    onToolCall,
    onNarration,
  } = params
  const client = new Anthropic({ apiKey })

  const hasReferenceImage = Boolean(referenceImageBase64)
  const userText = hasReferenceImage
    ? `Here's a reference image showing the desired UI/design. Task: ${prompt}`
    : prompt

  const transcript: AgentMessage[] = [...priorMessages]
  transcript.push({ role: 'user', content: userText })

  const anthropicMessages: Anthropic.MessageParam[] = priorMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  if (hasReferenceImage && referenceImageBase64) {
    anthropicMessages.push({
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: referenceImageMediaType,
            data: referenceImageBase64,
          },
        },
        {
          type: 'text',
          text: userText,
        },
      ],
    })
  } else {
    anthropicMessages.push({ role: 'user', content: userText })
  }

  let screenshotRoute: string | null = null
  const isFollowUp = priorMessages.length > 0
  const systemPrompt = isFollowUp
    ? `${systemPromptBase}${followUpSystemAddon}`
    : systemPromptBase

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model,
      max_tokens: 8096,
      system: systemPrompt,
      tools,
      messages: anthropicMessages,
    })

    const textBlocks = response.content.filter((b) => b.type === 'text')
    const assistantText = textBlocks
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n')
      .trim()

    if (assistantText) {
      transcript.push({ role: 'assistant', content: assistantText })
      if (onNarration) {
        await onNarration(assistantText)
      }
    }

    const toolUses = response.content.filter((b) => b.type === 'tool_use')

    if (toolUses.length === 0) {
      if (response.stop_reason === 'end_turn') {
        return {
          messages: transcript,
          prTitle: 'Bopple changes',
          prBody: assistantText || 'Automated changes by Bopple',
          summary: assistantText?.slice(0, 200) || 'Task completed',
          needsFeedback: false,
          feedbackPrompt: null,
          screenshotRoute,
        }
      }
      break
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const toolUse of toolUses) {
      if (toolUse.type !== 'tool_use') continue

      const input = toolUse.input as Record<string, unknown>
      if (onToolCall) {
        await onToolCall(toolUse.name, input)
      }

      const result = await executeTool(session, toolUse.name, input)

      if (result.screenshotRoute) {
        screenshotRoute = result.screenshotRoute
      }

      if (result.completed?.needsFeedback) {
        return {
          ...result.completed,
          messages: transcript,
          screenshotRoute,
        }
      }

      if (result.completed && !result.completed.needsFeedback) {
        return {
          ...result.completed,
          messages: transcript,
          screenshotRoute,
        }
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.output,
      })
    }

    anthropicMessages.push({ role: 'assistant', content: response.content })
    anthropicMessages.push({ role: 'user', content: toolResults })
  }

  return {
    messages: transcript,
    prTitle: 'Bopple changes',
    prBody: 'Agent reached turn limit before calling complete_task.',
    summary: 'Agent turn limit reached',
    needsFeedback: false,
    feedbackPrompt: null,
    screenshotRoute,
  }
}
