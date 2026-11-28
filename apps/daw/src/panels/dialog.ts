// Win95 message boxes, shared by the panels: the preset panel's Delete and the Record button's
// "Save progress?" (2026-11-28). Moved here from presetPanel.ts so they work outside dev mode.

import { ensureStyles, h } from './dom';
import { titleBar } from './w95';

const CSS = `
.ivp-modal-back { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center;
  background: rgb(0 0 0 / 0.15); }
.ivp-modal { min-width: 280px; }
.ivp-modal-body { padding: 14px 12px 10px; }
.ivp-modal-row { display: flex; gap: 6px; justify-content: center; padding: 0 0 8px; }
.ivp-modal-row .w95-btn { min-width: 75px; }
`;

let styleEl: HTMLStyleElement | undefined;
function ensureDialogStyles(): void {
  ensureStyles();
  if (styleEl?.isConnected) return;
  styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);
}

/** A box with these buttons. Resolves with the index of the one pressed; Escape and X give `cancel`. */
function box(
  title: string,
  text: string,
  buttons: readonly string[],
  opts: { cancel: number; focus: number },
): Promise<number> {
  ensureDialogStyles();
  return new Promise((done) => {
    const back = h('div', 'ivp-modal-back');
    const win = h('div', 'ivp-modal w95-window w95');
    win.setAttribute('role', 'alertdialog');
    win.setAttribute('aria-label', title);
    const finish = (i: number): void => {
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      done(i);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      finish(opts.cancel);
    };
    const { bar } = titleBar(title, [
      { label: 'X', title: 'Close', onClick: () => finish(opts.cancel) },
    ]);
    const body = h('div', 'ivp-modal-body', text);
    const row = h('div', 'ivp-modal-row');
    const els = buttons.map((label, i) => {
      const b = h('button', 'w95-btn', label);
      b.type = 'button';
      b.addEventListener('click', () => finish(i));
      row.append(b);
      return b;
    });
    win.append(bar, body, row);
    back.append(win);
    document.body.append(back);
    document.addEventListener('keydown', onKey, true);
    els[opts.focus]?.focus();
  });
}

/** A Yes / No box. Resolves true on Yes; Escape, No and X are false. No has focus unless `focusYes`. */
export async function askYesNo(
  title: string,
  question: string,
  focusYes = false,
): Promise<boolean> {
  return (await box(title, question, ['Yes', 'No'], { cancel: 1, focus: focusYes ? 0 : 1 })) === 0;
}

/** A box with one OK button. */
export async function showMessage(title: string, text: string): Promise<void> {
  await box(title, text, ['OK'], { cancel: 0, focus: 0 });
}
