interface ScreenshotSlotProps {
  label: string;
  aspect?: "video" | "phone";
  className?: string;
}

export function ScreenshotSlot({
  label,
  aspect = "video",
  className = "",
}: ScreenshotSlotProps) {
  const inner = (
    <div
      className={`flex items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-[#0A0A0B] ${
        aspect === "phone" ? "aspect-[9/16] min-h-[280px]" : "aspect-[16/10]"
      }`}
    >
      <span className="font-mono text-[10px] tracking-wider text-[#525252] uppercase">
        {label}
      </span>
    </div>
  );

  if (aspect === "phone") {
    return (
      <figure className={`mx-auto max-w-[260px] ${className}`}>
        <div className="rounded-[1.75rem] border border-white/[0.08] p-2">
          {inner}
        </div>
      </figure>
    );
  }

  return <figure className={className}>{inner}</figure>;
}
