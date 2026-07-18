interface DiffViewerProps {
  diff?: string | null
  placeholder?: string
}

function lineClass(line: string): string {
  if (line.startsWith('diff --git') || line.startsWith('index ')) {
    return 'text-zinc-600'
  }
  if (line.startsWith('@@')) return 'text-cyan-400'
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-zinc-500'
  if (line.startsWith('+')) return 'text-emerald-400 bg-emerald-500/10'
  if (line.startsWith('-')) return 'text-red-400 bg-red-500/10'
  return 'text-zinc-400'
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
    <div className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 text-xs font-mono leading-relaxed max-h-96">
      <pre className="min-w-full w-max">
        {lines.map((line, i) => (
          <div key={i} className={`px-4 ${lineClass(line)}`}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}
