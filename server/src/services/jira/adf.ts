import { markdownToAdf } from 'marklassian';

type AdfMark = { type: string; attrs?: Record<string, unknown> };
type AdfNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  marks?: AdfMark[];
  text?: string;
};
export type AdfDocument = {
  version: 1;
  type: 'doc';
  content: AdfNode[];
};

const TEXT_NODE_MAX = 30_000;

const JIRA_CODE_LANGUAGES = new Set([
  'abap', 'actionscript', 'ada', 'arduino', 'autoit', 'c', 'clojure', 'coffeescript',
  'cpp', 'csharp', 'css', 'cuda', 'd', 'dart', 'delphi', 'elixir', 'erlang', 'fortran',
  'foxpro', 'go', 'graphql', 'groovy', 'haskell', 'haxe', 'html', 'java', 'javascript',
  'json', 'julia', 'kotlin', 'latex', 'livescript', 'lua', 'matlab', 'objectivec',
  'ocaml', 'pascal', 'perl', 'php', 'plaintext', 'powershell', 'prolog', 'puppet',
  'python', 'qml', 'r', 'ruby', 'rust', 'sass', 'scala', 'scheme', 'shell', 'smalltalk',
  'sql', 'standardml', 'swift', 'tcl', 'tex', 'typescript', 'vala', 'vbnet', 'verilog',
  'vhdl', 'visualbasic', 'xml', 'xquery', 'yaml', 'bash', 'diff',
]);

const CODE_LANGUAGE_ALIASES: Record<string, string | null> = {
  js: 'javascript',
  node: 'javascript',
  nodejs: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  rb: 'ruby',
  kt: 'kotlin',
  jsonc: 'json',
  json5: 'json',
  tsx: 'typescript',
  jsx: 'javascript',
  'objective-c': 'objectivec',
  objc: 'objectivec',
  text: null,
  txt: null,
  mermaid: null,
  markdown: null,
  md: null,
  console: null,
  output: null,
};

type Parent =
  | 'doc'
  | 'paragraph'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'listItem'
  | 'blockquote'
  | 'codeBlock'
  | 'table'
  | 'tableRow'
  | 'tableCell'
  | 'tableHeader';

const BLOCK_PARENTS = new Set<Parent>(['doc', 'blockquote', 'listItem', 'tableCell', 'tableHeader']);
const INLINE_PARENTS = new Set<Parent>(['paragraph', 'heading']);

function isNode(value: unknown): value is AdfNode {
  return typeof value === 'object' && value !== null && typeof (value as AdfNode).type === 'string';
}

function isValidHref(href: unknown): href is string {
  if (typeof href !== 'string' || href.length === 0 || href.length > 2048) return false;
  if (/[\s<>]/.test(href)) return false;
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function chunkText(text: string): AdfNode[] {
  if (!text) return [];
  const nodes: AdfNode[] = [];
  for (let i = 0; i < text.length; i += TEXT_NODE_MAX) {
    nodes.push({ type: 'text', text: text.slice(i, i + TEXT_NODE_MAX) });
  }
  return nodes;
}

function paragraphFromText(text: string): AdfNode {
  const content = chunkText(text.length ? text : ' ');
  return { type: 'paragraph', content };
}

function extractText(node: AdfNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (!Array.isArray(node.content)) return '';
  return node.content.map(extractText).join(node.type === 'paragraph' || node.type === 'heading' ? '' : '\n');
}

function sanitizeMarks(marks: unknown): AdfMark[] | undefined {
  if (!Array.isArray(marks) || marks.length === 0) return undefined;
  const cleaned: AdfMark[] = [];
  let hasCode = false;
  for (const mark of marks) {
    if (!mark || typeof mark !== 'object' || typeof (mark as AdfMark).type !== 'string') continue;
    const type = (mark as AdfMark).type;
    if (type === 'link') {
      const href = (mark as AdfMark).attrs?.href;
      if (!isValidHref(href)) continue;
      cleaned.push({ type: 'link', attrs: { href } });
      continue;
    }
    if (type === 'code') {
      hasCode = true;
      cleaned.push({ type: 'code' });
      continue;
    }
    if (type === 'strong' || type === 'em' || type === 'strike' || type === 'underline') {
      cleaned.push({ type });
    }
  }
  const resolved = hasCode
    ? cleaned.filter((mark) => mark.type === 'code' || mark.type === 'link')
    : cleaned;
  return resolved.length ? resolved : undefined;
}

function normalizeCodeLanguage(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const key = raw.trim().toLowerCase();
  if (!key) return undefined;
  if (Object.prototype.hasOwnProperty.call(CODE_LANGUAGE_ALIASES, key)) {
    const aliased = CODE_LANGUAGE_ALIASES[key];
    return aliased ?? undefined;
  }
  if (JIRA_CODE_LANGUAGES.has(key)) return key;
  return undefined;
}

function mediaToParagraph(node: AdfNode): AdfNode {
  const media = node.type === 'media' ? node : (node.content ?? []).find((child) => child.type === 'media');
  const url = media?.attrs?.url;
  const alt = typeof media?.attrs?.alt === 'string' && media.attrs.alt.trim()
    ? media.attrs.alt
    : typeof url === 'string' && url
      ? url
      : 'image';
  if (isValidHref(url)) {
    return {
      type: 'paragraph',
      content: [{ type: 'text', text: String(alt), marks: [{ type: 'link', attrs: { href: url } }] }],
    };
  }
  return paragraphFromText(String(alt));
}

function taskItemToListItem(node: AdfNode): AdfNode {
  const children = Array.isArray(node.content) ? node.content : [];
  const inline: AdfNode[] = [];
  const blocks: AdfNode[] = [];
  for (const child of children) {
    if (!isNode(child)) continue;
    if (child.type === 'text' || child.type === 'hardBreak' || child.type === 'emoji' || child.type === 'mention') {
      inline.push(child);
    } else {
      blocks.push(child);
    }
  }
  const content: AdfNode[] = [];
  if (inline.length) content.push({ type: 'paragraph', content: inline });
  content.push(...blocks);
  return { type: 'listItem', content };
}

function asBlock(node: AdfNode): AdfNode[] {
  if (BLOCK_PARENTS.has(node.type as Parent) || node.type === 'paragraph' || node.type === 'heading'
    || node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'codeBlock'
    || node.type === 'blockquote' || node.type === 'rule' || node.type === 'table') {
    return [node];
  }
  if (node.type === 'text' || node.type === 'hardBreak') {
    return [{ type: 'paragraph', content: [node] }];
  }
  const text = extractText(node).trim();
  return text ? [paragraphFromText(text)] : [];
}

function asInline(node: AdfNode): AdfNode[] {
  if (node.type === 'text' || node.type === 'hardBreak') return [node];
  const text = extractText(node);
  return chunkText(text);
}

function emptyParagraph(): AdfNode {
  return { type: 'paragraph', content: [{ type: 'text', text: ' ' }] };
}

function sanitizeNode(node: AdfNode, parent: Parent): AdfNode[] {
  let current = node;

  if (current.type === 'taskList') {
    current = {
      type: 'bulletList',
      content: (current.content ?? []).map((item) => (
        item.type === 'taskItem' ? taskItemToListItem(item) : item
      )),
    };
  } else if (current.type === 'taskItem') {
    current = taskItemToListItem(current);
  } else if (current.type === 'mediaSingle' || current.type === 'media') {
    current = mediaToParagraph(current);
  } else if (current.type === 'panel' || current.type === 'expand' || current.type === 'nestedExpand') {
    return sanitizeChildren(current.content ?? [], parent);
  }

  if (INLINE_PARENTS.has(parent)) {
    if (current.type === 'text') {
      if (typeof current.text !== 'string' || current.text.length === 0) return [];
      const marks = sanitizeMarks(current.marks);
      const out: AdfNode = { type: 'text', text: current.text };
      if (marks) out.marks = marks;
      return [out];
    }
    if (current.type === 'hardBreak') return [{ type: 'hardBreak' }];
    return asInline(current);
  }

  if (parent === 'bulletList' || parent === 'orderedList') {
    if (current.type !== 'listItem') {
      const content = sanitizeChildren(asBlock(current), 'listItem');
      return [{ type: 'listItem', content: content.length ? content : [emptyParagraph()] }];
    }
    const content = sanitizeChildren(current.content ?? [], 'listItem');
    if (!content.length) content.push(emptyParagraph());
    if (!content.some((child) => child.type === 'paragraph' || child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'codeBlock')) {
      content.unshift(emptyParagraph());
    }
    return [{ type: 'listItem', content }];
  }

  if (parent === 'table') {
    if (current.type !== 'tableRow') return [];
    const content = sanitizeChildren(current.content ?? [], 'tableRow');
    return content.length ? [{ type: 'tableRow', content }] : [];
  }

  if (parent === 'tableRow') {
    const cellType = current.type === 'tableHeader' ? 'tableHeader' : 'tableCell';
    const content = sanitizeChildren(current.content ?? [], cellType);
    return [{ type: cellType, content: content.length ? content : [emptyParagraph()] }];
  }

  if (parent === 'codeBlock') {
    const text = current.type === 'text' ? (current.text ?? '') : extractText(current);
    return text.length ? chunkText(text) : [{ type: 'text', text: ' ' }];
  }

  if (BLOCK_PARENTS.has(parent)) {
    return sanitizeBlock(current);
  }

  return [];
}

function sanitizeBlock(node: AdfNode): AdfNode[] {
  switch (node.type) {
    case 'paragraph': {
      const content = sanitizeChildren(node.content ?? [], 'paragraph');
      return content.length ? [{ type: 'paragraph', content }] : [];
    }
    case 'heading': {
      const levelRaw = Number(node.attrs?.level);
      const level = Number.isInteger(levelRaw) ? Math.min(6, Math.max(1, levelRaw)) : 1;
      const content = sanitizeChildren(node.content ?? [], 'heading');
      return content.length ? [{ type: 'heading', attrs: { level }, content }] : [];
    }
    case 'bulletList':
    case 'orderedList': {
      const parent = node.type as Parent;
      const content = sanitizeChildren(node.content ?? [], parent);
      if (!content.length) return [];
      const out: AdfNode = { type: node.type, content };
      if (node.type === 'orderedList') {
        const orderRaw = Number(node.attrs?.order);
        const order = Number.isInteger(orderRaw) && orderRaw >= 1 ? orderRaw : 1;
        out.attrs = { order };
      }
      return [out];
    }
    case 'listItem': {
      const content = sanitizeChildren(node.content ?? [], 'listItem');
      return [{
        type: 'bulletList',
        content: [{ type: 'listItem', content: content.length ? content : [emptyParagraph()] }],
      }];
    }
    case 'codeBlock': {
      const content = sanitizeChildren(node.content ?? [], 'codeBlock');
      const out: AdfNode = { type: 'codeBlock', content: content.length ? content : [{ type: 'text', text: ' ' }] };
      const language = normalizeCodeLanguage(node.attrs?.language);
      if (language) out.attrs = { language };
      return [out];
    }
    case 'blockquote': {
      const content = sanitizeChildren(node.content ?? [], 'blockquote');
      return content.length ? [{ type: 'blockquote', content }] : [];
    }
    case 'rule':
      return [{ type: 'rule' }];
    case 'table': {
      const content = sanitizeChildren(node.content ?? [], 'table');
      return content.length ? [{ type: 'table', content }] : [];
    }
    case 'text':
    case 'hardBreak':
      return asBlock(node);
    default: {
      const text = extractText(node).trim();
      return text ? [paragraphFromText(text)] : sanitizeChildren(node.content ?? [], 'doc');
    }
  }
}

function sanitizeChildren(nodes: AdfNode[], parent: Parent): AdfNode[] {
  const out: AdfNode[] = [];
  for (const node of nodes) {
    if (!isNode(node)) continue;
    out.push(...sanitizeNode(node, parent));
  }
  return out;
}

export function plainTextAdf(text: string): AdfDocument {
  const normalized = (text ?? '').replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const content: AdfNode[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const inline: AdfNode[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length) inline.push(...chunkText(lines[i]));
      if (i < lines.length - 1) inline.push({ type: 'hardBreak' });
    }
    if (!inline.length) continue;
    content.push({ type: 'paragraph', content: inline });
  }
  return {
    version: 1,
    type: 'doc',
    content: content.length ? content : [emptyParagraph()],
  };
}

export function sanitizeAdfDoc(doc: unknown): AdfDocument {
  if (!isNode(doc) || doc.type !== 'doc') {
    return { version: 1, type: 'doc', content: [] };
  }
  const content = sanitizeChildren(Array.isArray(doc.content) ? doc.content : [], 'doc');
  return { version: 1, type: 'doc', content };
}

export function markdownToJiraAdf(text: string): AdfDocument {
  const source = text ?? '';
  try {
    const converted = markdownToAdf(source);
    const sanitized = sanitizeAdfDoc(converted);
    if (sanitized.content.length > 0) return sanitized;
  } catch {
    // Fall through to a guaranteed-valid plain-text document.
  }
  return plainTextAdf(source);
}
