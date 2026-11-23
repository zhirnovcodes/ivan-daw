// v1.2 sticky note text: the only formatting is `**bold**` and `<https://…>` links.
// Design: docs/v1.2-redesign.md, "5. Sticky notes". The parser is pure; `renderNoteText` builds DOM
// nodes from its output and never uses innerHTML, so a note can't inject markup.

export type NoteSegment =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'link'; href: string };

/** `<http://…>` or `<https://…>`, no spaces or angle brackets inside. */
const LINK = /<(https?:\/\/[^\s<>]+)>/g;
/** `**…**` on one line, at least one character inside. */
const BOLD = /\*\*([^\n]+?)\*\*/g;

function pushText(out: NoteSegment[], text: string): void {
  if (text === '') return;
  const last = out[out.length - 1];
  if (last?.kind === 'text') last.text += text;
  else out.push({ kind: 'text', text });
}

function boldAndText(out: NoteSegment[], text: string): void {
  let at = 0;
  for (const m of text.matchAll(BOLD)) {
    pushText(out, text.slice(at, m.index));
    out.push({ kind: 'bold', text: m[1] ?? '' });
    at = m.index + m[0].length;
  }
  pushText(out, text.slice(at));
}

/** One line of note text → segments. Unclosed `**` and anything that isn't a valid link stay plain text. */
export function parseNoteLine(line: string): NoteSegment[] {
  const out: NoteSegment[] = [];
  let at = 0;
  for (const m of line.matchAll(LINK)) {
    boldAndText(out, line.slice(at, m.index));
    out.push({ kind: 'link', href: m[1] ?? '' });
    at = m.index + m[0].length;
  }
  boldAndText(out, line.slice(at));
  return out;
}

/** Whole note text → one segment list per line. Line breaks are kept. */
export function parseNoteText(text: string): NoteSegment[][] {
  return text.replace(/\r\n?/g, '\n').split('\n').map(parseNoteLine);
}

/** Builds the note body: text nodes, `<b>` and `<a target=_blank rel=noopener>`, `<br>` between lines. */
export function renderNoteText(text: string, doc: Document = document): DocumentFragment {
  const frag = doc.createDocumentFragment();
  parseNoteText(text).forEach((line, i) => {
    if (i > 0) frag.append(doc.createElement('br'));
    for (const seg of line) {
      if (seg.kind === 'text') frag.append(doc.createTextNode(seg.text));
      else if (seg.kind === 'bold') {
        const b = doc.createElement('b');
        b.textContent = seg.text;
        frag.append(b);
      } else {
        const a = doc.createElement('a');
        a.href = seg.href;
        a.textContent = seg.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        frag.append(a);
      }
    }
  });
  return frag;
}
