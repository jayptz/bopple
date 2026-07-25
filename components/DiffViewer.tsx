interface DiffViewerProps {
  diff?: string
  placeholder?: string
}

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-dash-text/50'
  if (line.startsWith('+')) return 'text-dash-accent bg-dash-accent/10'
  if (line.startsWith('-')) return 'text-dash-text/40 bg-dash-text/5'
  if (line.startsWith('@@')) return 'text-dash-text/50'
  if (line.startsWith('diff ') || line.startsWith('index ')) return 'text-dash-text/40'
  return 'text-dash-text/80'
}

export function DiffViewer({
  diff,
  placeholder = 'Diff will appear here when available.',
}: DiffViewerProps) {
  if (!diff) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-dash-border bg-dash-bg p-4 text-xs font-mono text-dash-text/40 leading-relaxed">
        {placeholder}
      </pre>
    )
  }

  const lines = diff.split('\n')

  return (
    <pre className="overflow-x-auto rounded-lg border border-dash-border bg-dash-bg p-2 text-xs font-mono leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className={`whitespace-pre-wrap break-all px-2 py-px ${lineClass(line)}`}>
          {line || ' '}
        </div>
      ))}
    </pre>
  )
}
