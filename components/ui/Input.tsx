import { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ label, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-medium text-dash-text/50 uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        className={`w-full rounded-lg border border-dash-border bg-dash-bg px-3 py-2 text-sm text-dash-text placeholder:text-dash-text/35 focus:border-dash-accent focus:outline-none focus:ring-1 focus:ring-dash-accent ${className}`}
        {...props}
      />
    </div>
  )
}
