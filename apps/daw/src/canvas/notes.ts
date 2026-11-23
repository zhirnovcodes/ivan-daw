// v1.2 sticky notes on the canvas: the top layer of the world, so they pan and zoom with it and cover
// everything else. Design: docs/v1.2-redesign.md, "2. Layers" and "5. Sticky notes".
//
// Title bar drag moves a note, the bottom-right grip resizes it, double-click edits the raw text,
// click outside or Esc shows it formatted again. Play-only: shown and links work, nothing else.

import { effect } from '@preact/signals-core';
import type { Note } from '../model/project';
import { titleBar } from '../panels/w95';
import { editNote, moveNote, removeNote, resizeNote, setNoteText } from '../store/actions';
import { camera, editingNote, mode, project } from '../store/store';
import { renderNoteText } from './noteText';

interface NoteView {
  el: HTMLDivElement;
  body: HTMLDivElement;
  shown: string | undefined; // the text rendered in `body`, to skip needless rebuilds
  editor: HTMLTextAreaElement | undefined;
}

/** Follows the pointer from `down`, calling `step` with the world-px offset since the start. */
function drag(
  down: PointerEvent,
  target: HTMLElement,
  step: (dx: number, dy: number) => void,
): void {
  const z = camera.peek().z;
  const sx = down.clientX;
  const sy = down.clientY;
  target.setPointerCapture(down.pointerId);
  const move = (e: PointerEvent): void => step((e.clientX - sx) / z, (e.clientY - sy) / z);
  const end = (): void => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', end);
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}

export function mountNotes(layer: HTMLElement): () => void {
  const views = new Map<string, NoteView>();
  const readOnly = (): boolean => mode.peek() === 'play';

  function build(note: Note): NoteView {
    const el = document.createElement('div');
    el.className = 'ivd-note w95-window';
    el.dataset.note = note.id;
    const buttons = readOnly()
      ? []
      : [{ label: 'X' as const, title: 'Delete note', onClick: () => removeNote(note.id) }];
    const { bar } = titleBar('Note', buttons);
    const body = document.createElement('div');
    body.className = 'ivd-note-body w95-scroll';
    el.append(bar, body);

    // Notes are their own world: left clicks and wheel scrolling stay inside (ctrl + wheel still zooms).
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 0) e.stopPropagation();
    });
    el.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) e.stopPropagation();
    });

    if (!readOnly()) {
      bar.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const n = current(note.id);
        if (!n) return;
        drag(e, bar, (dx, dy) => moveNote(note.id, Math.round(n.x + dx), Math.round(n.y + dy)));
      });
      const grip = document.createElement('div');
      grip.className = 'ivd-note-grip';
      grip.title = 'Resize';
      grip.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const n = current(note.id);
        if (!n) return;
        drag(e, grip, (dx, dy) => resizeNote(note.id, n.w + dx, n.h + dy));
      });
      el.append(grip);
      body.addEventListener('dblclick', (e) => {
        if ((e.target as HTMLElement).closest('a')) return;
        editNote(note.id);
      });
    }
    layer.append(el);
    return { el, body, shown: undefined, editor: undefined };
  }

  const current = (id: string): Note | undefined => project.peek().notes?.find((n) => n.id === id);

  function openEditor(v: NoteView, note: Note): void {
    if (v.editor) return;
    const ta = document.createElement('textarea');
    ta.className = 'ivd-note-edit w95-scroll';
    ta.value = note.text;
    ta.spellcheck = false;
    ta.setAttribute('aria-label', 'Note text');
    ta.addEventListener('input', () => setNoteText(note.id, ta.value));
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation(); // Delete, Space and Ctrl keys type here; they don't reach the canvas or transport
      if (e.key === 'Escape') editNote(undefined);
    });
    ta.addEventListener('blur', () => {
      if (editingNote.peek() === note.id) editNote(undefined);
    });
    v.body.replaceChildren(ta);
    v.shown = undefined;
    v.editor = ta;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  function render(): void {
    const notes = project.value.notes ?? [];
    const editing = editingNote.value;
    const seen = new Set<string>();
    for (const note of notes) {
      seen.add(note.id);
      const v = views.get(note.id) ?? build(note);
      views.set(note.id, v);
      v.el.style.transform = `translate(${note.x}px, ${note.y}px)`;
      v.el.style.width = `${note.w}px`;
      v.el.style.height = `${note.h}px`;
      if (editing === note.id && !readOnly()) {
        openEditor(v, note);
      } else {
        v.editor = undefined;
        if (v.shown !== note.text) {
          v.body.replaceChildren(renderNoteText(note.text));
          v.shown = note.text;
        }
      }
    }
    for (const [id, v] of views) {
      if (seen.has(id)) continue;
      v.el.remove();
      views.delete(id);
    }
  }

  const stop = effect(render);
  // A press anywhere outside the open note closes its editor. The canvas prevents default on its own
  // presses, so the textarea's blur alone isn't enough.
  const outside = (e: PointerEvent): void => {
    const id = editingNote.peek();
    if (id === undefined) return;
    const el = views.get(id)?.el;
    if (el && e.target instanceof Node && el.contains(e.target)) return;
    editNote(undefined);
  };
  document.addEventListener('pointerdown', outside, true);
  return () => {
    stop();
    document.removeEventListener('pointerdown', outside, true);
    for (const v of views.values()) v.el.remove();
    views.clear();
  };
}
