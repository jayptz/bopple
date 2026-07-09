import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

interface GenerateCodeParams {
  prompt: string
  repoContext: string
  model: string
  apiKey?: string
}

export interface GenerateCodeResult {
  files: { path: string; content: string }[]
  prTitle: string
  prBody: string
  summary: string
}

const systemPrompt = `You are an expert software engineer. You are given a coding task and repository context.

Your job is to:
1. Understand the task
2. Write clean, working code that solves it
3. Return a JSON response with the files to create or modify

Always respond with valid JSON in this exact format:
{
  "files": [
    {
      "path": "relative/path/to/file.ts",
      "content": "full file content here"
    }
  ],
  "prTitle": "Short descriptive PR title",
  "prBody": "## What this PR does\\n\\nBrief description of changes",
  "summary": "One sentence summary of what was done"
}

Rules:
- Write production-quality code
- Follow the patterns you see in the repo context
- Only include files that need to be created or modified
- Always return valid JSON, nothing else`

function parseJsonResponse(text: string): GenerateCodeResult {
  const cleaned = text.replace(/^```json\n?|\n?```$/g, '').trim()
  return JSON.parse(cleaned) as GenerateCodeResult
}

export async function generateCode(
  params: GenerateCodeParams
): Promise<GenerateCodeResult> {
  const { prompt, repoContext, model, apiKey } = params
  const userMessage = `Repository context:\n${repoContext}\n\nTask: ${prompt}`

  if (model.startsWith('gpt')) {
    const client = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY })
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
    })
    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('No response from OpenAI')
    return parseJsonResponse(content)
  }

  const client = new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  })
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response from Claude')
  return parseJsonResponse(block.text)
}
