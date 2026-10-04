export type WriteupInline =
  | { type: "text"; value: string }
  | { type: "code"; value: string };

export interface WriteupStage {
  title: string;
  kicker: string;
  body: string;
}

export type WriteupBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; id: string; text: string }
  | { type: "code"; code: string }
  | { type: "stages"; stages: WriteupStage[] }
  | { type: "tags"; tags: string[] };

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function flushParagraph(buffer: string[], blocks: WriteupBlock[]): void {
  const text = buffer.join(" ").trim();
  buffer.length = 0;
  if (text.length > 0) {
    blocks.push({ type: "paragraph", text });
  }
}

function parseBlocks(markdown: string): WriteupBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: WriteupBlock[] = [];
  const paragraph: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.startsWith("```")) {
      flushParagraph(paragraph, blocks);
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ type: "code", code: code.join("\n") });
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph(paragraph, blocks);
      const text = line.slice(3).trim();
      blocks.push({ type: "heading", id: slug(text), text });
      index += 1;
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph(paragraph, blocks);
      index += 1;
      continue;
    }

    paragraph.push(line.trim());
    index += 1;
  }

  flushParagraph(paragraph, blocks);
  return blocks;
}

function isParagraph(
  block: WriteupBlock
): block is Extract<WriteupBlock, { type: "paragraph" }> {
  return block.type === "paragraph";
}

function reshape(blocks: WriteupBlock[]): WriteupBlock[] {
  const output: WriteupBlock[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block) continue;

    if (block.type === "heading" && block.text === "Architecture") {
      output.push(block);
      const following: Extract<WriteupBlock, { type: "paragraph" }>[] = [];
      index += 1;
      while (index < blocks.length) {
        const next = blocks[index];
        if (!next || !isParagraph(next)) break;
        following.push(next);
        index += 1;
      }
      index -= 1;

      const stages: WriteupStage[] = [];
      let cursor = 0;
      while (cursor + 2 < following.length) {
        const title = following[cursor]?.text ?? "";
        const kicker = following[cursor + 1]?.text ?? "";
        const body = following[cursor + 2]?.text ?? "";
        if (title.length > 48 || kicker.length > 80 || body.length < 40) {
          break;
        }
        stages.push({ title, kicker, body });
        cursor += 3;
      }

      if (stages.length > 0) {
        output.push({ type: "stages", stages });
      }
      const remainder = stages.length > 0 ? following.slice(cursor) : following;
      output.push(...remainder);
      continue;
    }

    if (block.type === "heading" && block.text === "Built with") {
      output.push(block);
      const next = blocks[index + 1];
      if (next && isParagraph(next) && next.text.includes("·")) {
        output.push({
          type: "tags",
          tags: next.text
            .split("·")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0),
        });
        index += 1;
      }
      continue;
    }

    output.push(block);
  }

  return output;
}

export function parseWriteup(markdown: string): WriteupBlock[] {
  return reshape(parseBlocks(markdown));
}

export function inlineWriteup(text: string): WriteupInline[] {
  const parts = text.split(/(`[^`]+`)/g).filter((part) => part.length > 0);
  return parts.map((part) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return { type: "code", value: part.slice(1, -1) };
    }
    return { type: "text", value: part };
  });
}
