export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: InlineNode[] }
  | { type: "break" };

export type BlockNode =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] };

const UNSAFE_PROTOCOL = /^(javascript|data|vbscript):/i;

/** Allow only http(s) and mailto links. Everything else stays plain text. */
export function isSafeUrl(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed || UNSAFE_PROTOCOL.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

export function parseMarkdown(source: string): BlockNode[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: BlockNode[] = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }
    const list = takeList(lines, index);
    if (list) {
      blocks.push(list.block);
      index = list.next;
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !listMarker(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
  }
  return blocks;
}

function takeList(
  lines: string[],
  start: number,
): { block: BlockNode; next: number } | null {
  const first = listMarker(lines[start]);
  if (!first) return null;
  const items: InlineNode[][] = [];
  let index = start;
  while (index < lines.length) {
    const marker = listMarker(lines[index]);
    if (!marker || marker.ordered !== first.ordered) break;
    items.push(parseInline(marker.text));
    index += 1;
  }
  return { block: { type: "list", ordered: first.ordered, items }, next: index };
}

function listMarker(line: string): { ordered: boolean; text: string } | null {
  const unordered = /^[\t ]*[-*+]\s+(.+)$/.exec(line);
  if (unordered) return { ordered: false, text: unordered[1] };
  const ordered = /^[\t ]*\d+[.)]\s+(.+)$/.exec(line);
  if (ordered) return { ordered: true, text: ordered[1] };
  return null;
}

export function parseInline(input: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    nodes.push({ type: "text", text: buffer });
    buffer = "";
  };

  let index = 0;
  while (index < input.length) {
    const rest = input.slice(index);
    if (rest.startsWith("***")) {
      const close = rest.indexOf("***", 3);
      if (close > 3) {
        flush();
        nodes.push({
          type: "bold",
          children: [{ type: "italic", children: parseInline(rest.slice(3, close)) }],
        });
        index += close + 3;
        continue;
      }
    }
    if (rest.startsWith("**") || rest.startsWith("__")) {
      const marker = rest.slice(0, 2);
      const close = rest.indexOf(marker, 2);
      if (close > 2) {
        flush();
        nodes.push({ type: "bold", children: parseInline(rest.slice(2, close)) });
        index += close + 2;
        continue;
      }
    }
    if (rest[0] === "`") {
      const close = rest.indexOf("`", 1);
      if (close > 1) {
        flush();
        nodes.push({ type: "code", text: rest.slice(1, close) });
        index += close + 1;
        continue;
      }
    }
    const link = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      flush();
      if (isSafeUrl(link[2])) {
        nodes.push({ type: "link", href: link[2], children: parseInline(link[1]) });
      } else {
        nodes.push({ type: "text", text: link[1] });
      }
      index += link[0].length;
      continue;
    }
    const autolink = /^(https?:\/\/[^\s<]+)/.exec(rest);
    if (autolink) {
      flush();
      const href = autolink[1].replace(/[.,;:!?)]+$/, "");
      const trailing = autolink[1].slice(href.length);
      if (isSafeUrl(href)) {
        nodes.push({ type: "link", href, children: [{ type: "text", text: href }] });
      } else {
        nodes.push({ type: "text", text: href });
      }
      if (trailing) nodes.push({ type: "text", text: trailing });
      index += autolink[1].length;
      continue;
    }
    if ((rest[0] === "*" || rest[0] === "_") && rest[1] !== rest[0] && canOpenEmphasis(input, index, rest[0])) {
      const close = findEmphasisEnd(rest, rest[0]);
      if (close > 1) {
        flush();
        nodes.push({ type: "italic", children: parseInline(rest.slice(1, close)) });
        index += close + 1;
        continue;
      }
    }
    if (rest[0] === "\n") {
      flush();
      nodes.push({ type: "break" });
      index += 1;
      continue;
    }
    buffer += rest[0];
    index += 1;
  }
  flush();
  return nodes;
}

function canOpenEmphasis(input: string, index: number, marker: string): boolean {
  if (marker !== "_") return true;
  const prev = input[index - 1];
  return !prev || /[^\p{L}\p{N}]/u.test(prev);
}

function findEmphasisEnd(rest: string, marker: string): number {
  for (let i = 1; i < rest.length; i += 1) {
    if (rest[i] !== marker || rest[i + 1] === marker) continue;
    if (marker === "_" && rest[i + 1] && /[\p{L}\p{N}]/u.test(rest[i + 1])) continue;
    return i;
  }
  return -1;
}
