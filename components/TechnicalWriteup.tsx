import { readFileSync } from "node:fs";
import path from "node:path";
import {
  inlineWriteup,
  parseWriteup,
  type WriteupInline,
} from "@/lib/writeup";

const SOURCE_HREF = "https://jayptz.me/blogs/bopple";

function InlineText({
  parts,
  prefix,
}: {
  parts: WriteupInline[];
  prefix: string;
}) {
  return (
    <>
      {parts.map((part, index) =>
        part.type === "code" ? (
          <code
            key={`${prefix}-${index}`}
            className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[0.92em] text-zinc-100"
          >
            {part.value}
          </code>
        ) : (
          <span key={`${prefix}-${index}`}>{part.value}</span>
        )
      )}
    </>
  );
}

export function TechnicalWriteup() {
  const markdown = readFileSync(
    path.join(process.cwd(), "content/bopple-technical-writeup.md"),
    "utf8"
  );
  const blocks = parseWriteup(markdown);

  return (
    <section
      id="writeup"
      className="border-t border-zinc-800 bg-zinc-950 px-4 py-10 sm:px-6 sm:py-16"
    >
      <article className="mx-auto max-w-3xl">
        <p className="text-[13px] text-zinc-400">
          builds · Jul 22, 2026 · 8 min read
        </p>
        <h1 className="mt-3 text-[2rem] font-bold leading-tight tracking-tight text-white sm:text-5xl">
          Bopple
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-zinc-400">
          Technical writeup ·{" "}
          <a
            href={SOURCE_HREF}
            className="underline decoration-zinc-600 underline-offset-4 hover:text-white"
          >
            jayptz.me/blogs/bopple
          </a>
        </p>

        <div className="mt-8 space-y-5">
          {blocks.map((block, index) => {
            if (block.type === "heading") {
              return (
                <h2
                  key={block.id}
                  id={block.id}
                  className="pt-6 text-[1.35rem] font-semibold tracking-tight text-white sm:text-2xl"
                >
                  {block.text}
                </h2>
              );
            }

            if (block.type === "code") {
              return (
                <pre
                  key={`code-${index}`}
                  className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900 p-4 font-mono text-[12px] leading-relaxed text-zinc-200 sm:text-[13px]"
                >
                  <code>{block.code}</code>
                </pre>
              );
            }

            if (block.type === "stages") {
              return (
                <ol key={`stages-${index}`} className="space-y-3">
                  {block.stages.map((stage, stageIndex) => (
                    <li
                      key={stage.title}
                      className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5"
                    >
                      <p className="text-[12px] font-medium text-zinc-500">
                        {String(stageIndex + 1).padStart(2, "0")}
                      </p>
                      <h3 className="mt-1 text-[16px] font-semibold text-white">
                        {stage.title}
                      </h3>
                      <p className="mt-1 text-[13px] text-zinc-400">
                        {stage.kicker}
                      </p>
                      <p className="mt-3 text-[15px] leading-7 text-zinc-300">
                        <InlineText
                          prefix={stage.title}
                          parts={inlineWriteup(stage.body)}
                        />
                      </p>
                    </li>
                  ))}
                </ol>
              );
            }

            if (block.type === "tags") {
              return (
                <ul key={`tags-${index}`} className="flex flex-wrap gap-2">
                  {block.tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[12px] text-zinc-300"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              );
            }

            if (block.text === "Jump to details →") {
              return (
                <p key={`jump-${index}`}>
                  <a
                    href="#the-agent-loop"
                    className="text-[15px] text-zinc-200 underline decoration-zinc-600 underline-offset-4 hover:text-white"
                  >
                    {block.text}
                  </a>
                </p>
              );
            }

            const leadIn = block.text.length <= 90;

            return (
              <p
                key={`p-${index}`}
                className={
                  leadIn
                    ? "text-[15px] font-semibold leading-7 text-white"
                    : "text-[15px] leading-7 text-zinc-300"
                }
              >
                <InlineText
                  prefix={`p-${index}`}
                  parts={inlineWriteup(block.text)}
                />
              </p>
            );
          })}
        </div>
      </article>
    </section>
  );
}
