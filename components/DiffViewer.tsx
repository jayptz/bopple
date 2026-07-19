interface DiffViewerProps {
  diff?: string | null
  placeholder?: string
}

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-zinc-400'
  if (line.startsWith('+')) return 'text-emerald-400 bg-emerald-950/30'
  if (line.startsWith('-')) return 'text-red-400 bg-red-950/30'
  if (line.startsWith('@@')) return 'text-sky-400'
  if (line.startsWith('diff ') || line.startsWith('index ')) return 'text-zinc-500'
  return 'text-zinc-300'
}

export function DiffViewer({
  diff,
  placeholder = 'Diff will appear here when available.',
}: DiffViewerProps) {
  if (!diff) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs font-mono text-zinc-500 leading-relaxed">
        {placeholder}
      </pre>
    )
  }

  const lines = diff.split('\n')

  return (
    <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-xs font-mono leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className={`whitespace-pre-wrap break-all px-2 py-px ${lineClass(line)}`}>
          {line || ' '}
        </div>
      ))}
    </pre>
  )
}
