import { describe, expect, it } from 'vitest';
import { parseNoteLine, parseNoteText } from './noteText';

describe('parseNoteLine', () => {
  it('plain text stays one segment', () => {
    expect(parseNoteLine('Hello!')).toEqual([{ kind: 'text', text: 'Hello!' }]);
    expect(parseNoteLine('')).toEqual([]);
  });

  it('reads **bold**', () => {
    expect(parseNoteLine('a **b** c **d**')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'bold', text: 'b' },
      { kind: 'text', text: ' c ' },
      { kind: 'bold', text: 'd' },
    ]);
  });

  it('keeps unclosed or empty ** as text', () => {
    expect(parseNoteLine('2 ** 3')).toEqual([{ kind: 'text', text: '2 ** 3' }]);
    expect(parseNoteLine('****')).toEqual([{ kind: 'text', text: '****' }]);
  });

  it('reads <https://…> and <http://…> links', () => {
    expect(parseNoteLine('see <https://example.com/a?b=1> now')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', href: 'https://example.com/a?b=1' },
      { kind: 'text', text: ' now' },
    ]);
    expect(parseNoteLine('<http://x.org>')).toEqual([{ kind: 'link', href: 'http://x.org' }]);
  });

  it('refuses other schemes and broken links', () => {
    expect(parseNoteLine('<javascript:alert(1)>')).toEqual([
      { kind: 'text', text: '<javascript:alert(1)>' },
    ]);
    expect(parseNoteLine('<https://a b>')).toEqual([{ kind: 'text', text: '<https://a b>' }]);
    expect(parseNoteLine('https://plain.org')).toEqual([
      { kind: 'text', text: 'https://plain.org' },
    ]);
  });

  it('keeps HTML as text', () => {
    expect(parseNoteLine('<b>hi</b> <img src=x>')).toEqual([
      { kind: 'text', text: '<b>hi</b> <img src=x>' },
    ]);
  });

  it('bold and links side by side', () => {
    expect(parseNoteLine('**Docs:** <https://d.io>')).toEqual([
      { kind: 'bold', text: 'Docs:' },
      { kind: 'text', text: ' ' },
      { kind: 'link', href: 'https://d.io' },
    ]);
  });
});

describe('parseNoteText', () => {
  it('splits lines, keeps empty ones, and bold does not cross lines', () => {
    expect(parseNoteText('a\r\n\n**b\nc**')).toEqual([
      [{ kind: 'text', text: 'a' }],
      [],
      [{ kind: 'text', text: '**b' }],
      [{ kind: 'text', text: 'c**' }],
    ]);
  });
});
