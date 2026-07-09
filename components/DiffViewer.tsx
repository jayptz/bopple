interface DiffViewerProps {
  diff?: string
  placeholder?: string
}

export function DiffViewer({
  diff,
  placeholder = 'Diff will appear here when available.',
}: DiffViewerProps) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs font-mono text-zinc-300 leading-relaxed">
      {diff ?? placeholder}
    </pre>
  )
}
