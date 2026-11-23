// v1.2 Win95 look: font, colour tokens and the shared building blocks (bevels, buttons, fields,
// sliders, window chrome). Design: docs/v1.2-redesign.md, "1. Look". Class prefix: w95-.
// The canvas and the panels both call `ensureW95()`; the CSS goes in once.

/** Pentagon slider thumb (point down), 11 × 19, with the raised bevel drawn in. */
const THUMB = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="19" viewBox="0 0 11 19" shape-rendering="crispEdges">' +
    '<path d="M0 0H11V14L5.5 19L0 14Z" fill="#000"/>' +
    '<path d="M0 0H10V14L5.5 18L0 14Z" fill="#808080"/>' +
    '<path d="M0 0H10V13.5L5.5 17.5L0 13.5Z" fill="#fff"/>' +
    '<path d="M1 1H9V13.5L5.5 16.5L1 13.5Z" fill="#c0c0c0"/>' +
    '</svg>',
)}")`;

export const W95_CSS = `
@font-face { font-family: 'W95FA'; src: url('/fonts/w95fa.woff2') format('woff2'), url('/fonts/w95fa.woff') format('woff');
  font-display: block; }
:root {
  --w95-desk: #387F81; --w95-face: #C0C0C0; --w95-light: #FFFFFF; --w95-hilite: #DFDFDF; --w95-shadow: #808080;
  --w95-dark: #000000; --w95-title: #030081; --w95-title-text: #FFFFFF; --w95-field: #FFFFFF; --w95-track: #D9D9D9;
  --w95-note: #FFFFDE; --w95-link: #0000FF; --w95-select: #030081;
  --c-midi: #FFFC12; --c-arm: #0600FF; --c-audio: #FD0007;
  --w95-font: 'W95FA', 'MS Sans Serif', Tahoma, sans-serif;
  --w95-raised: inset -1px -1px var(--w95-dark), inset 1px 1px var(--w95-light),
    inset -2px -2px var(--w95-shadow), inset 2px 2px var(--w95-hilite);
  --w95-sunken: inset -1px -1px var(--w95-light), inset 1px 1px var(--w95-shadow),
    inset -2px -2px var(--w95-hilite), inset 2px 2px var(--w95-dark);
  --w95-pressed: inset -1px -1px var(--w95-light), inset 1px 1px var(--w95-dark),
    inset -2px -2px var(--w95-hilite), inset 2px 2px var(--w95-shadow);
  --w95-groove: inset -1px -1px var(--w95-light), inset 1px 1px var(--w95-shadow),
    inset -2px -2px var(--w95-shadow), inset 2px 2px var(--w95-light);
}
.w95 { font: 13px/1.2 var(--w95-font); color: #000; -webkit-font-smoothing: none; font-smooth: never; }
.w95-raised { background: var(--w95-face); box-shadow: var(--w95-raised); }
.w95-sunken { box-shadow: var(--w95-sunken); }
.w95-groove { box-shadow: var(--w95-groove); }

.w95-btn { font: inherit; color: #000; background: var(--w95-face); border: 0; border-radius: 0;
  box-shadow: var(--w95-raised); padding: 4px 12px; min-height: 23px; cursor: pointer; }
.w95-btn:active:not(:disabled), .w95-btn.on { box-shadow: var(--w95-pressed); padding: 5px 11px 3px 13px; }
.w95-btn:focus-visible { outline: 1px dotted #000; outline-offset: -5px; }
.w95-btn:disabled { color: var(--w95-shadow); text-shadow: 1px 1px var(--w95-light); cursor: default; }

.w95-field { font: inherit; color: #000; background: var(--w95-field); border: 0; border-radius: 0;
  box-shadow: var(--w95-sunken); padding: 3px 5px; height: 21px; box-sizing: border-box; }
.w95-field:focus { outline: none; }

.w95-select { position: relative; display: inline-flex; background: var(--w95-field); box-shadow: var(--w95-sunken);
  height: 21px; box-sizing: border-box; padding: 2px; }
.w95-select select { appearance: none; -webkit-appearance: none; font: inherit; color: #000; background: transparent;
  border: 0; border-radius: 0; padding: 0 20px 0 3px; flex: 1; min-width: 0; outline: none; cursor: pointer; }
.w95-select::after { content: ''; position: absolute; top: 2px; right: 2px; bottom: 2px; width: 16px; pointer-events: none;
  background: var(--w95-face) center / 7px 4px no-repeat
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='7' height='4'%3E%3Cpath d='M0 0H7L3.5 4Z'/%3E%3C/svg%3E");
  box-shadow: var(--w95-raised); }

.w95-range { -webkit-appearance: none; appearance: none; background: transparent; height: 21px; margin: 0; cursor: pointer; }
.w95-range:focus { outline: none; }
.w95-range::-webkit-slider-runnable-track { height: 4px; background: var(--w95-track); box-shadow: var(--w95-sunken); }
.w95-range::-moz-range-track { height: 4px; background: var(--w95-track); box-shadow: var(--w95-sunken); }
.w95-range::-webkit-slider-thumb { -webkit-appearance: none; width: 11px; height: 19px; margin-top: -8px; border: 0;
  background: ${THUMB}; }
.w95-range::-moz-range-thumb { width: 11px; height: 19px; border: 0; border-radius: 0; background: ${THUMB}; }
.w95-range:disabled { opacity: 0.5; cursor: default; }

.w95-window { background: var(--w95-face); box-shadow: var(--w95-raised); padding: 3px; box-sizing: border-box; }
.w95-titlebar { height: 18px; display: flex; align-items: center; gap: 2px; padding: 0 2px 0 4px;
  background: var(--w95-title); color: var(--w95-title-text); }
.w95-titlebar .w95-caption { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.w95-tbtn { width: 16px; height: 14px; padding: 0; border: 0; border-radius: 0; background: var(--w95-face);
  box-shadow: var(--w95-raised); font: 11px/14px var(--w95-font); color: #000; text-align: center; cursor: pointer; flex: none; }
.w95-tbtn:active { box-shadow: var(--w95-pressed); }
.w95-tbtn + .w95-tbtn.close { margin-left: 2px; }

.w95-check { appearance: none; -webkit-appearance: none; width: 13px; height: 13px; margin: 0; background: var(--w95-field);
  box-shadow: var(--w95-sunken); cursor: pointer; flex: none; }
.w95-check:checked { background: var(--w95-field) center / 7px 7px no-repeat
  url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='7' height='7' shape-rendering='crispEdges'%3E%3Cpath d='M6 0h1v3h-1v1h-1v1h-1v1h-1v1h-1v-1h-1v-1h-1v-3h1v1h1v1h1v-1h1v-1h1v-1h1z'/%3E%3C/svg%3E"); }

.w95-scroll { scrollbar-color: var(--w95-face) #dfdfdf; }
.w95-scroll::-webkit-scrollbar { width: 16px; height: 16px; background: #dfdfdf; }
.w95-scroll::-webkit-scrollbar-thumb { background: var(--w95-face); box-shadow: var(--w95-raised); }
.w95-scroll::-webkit-scrollbar-button:single-button { display: block; width: 16px; height: 16px; background: var(--w95-face);
  box-shadow: var(--w95-raised); }

.w95-menu { background: var(--w95-face); box-shadow: var(--w95-raised); padding: 3px; }
.w95-menu button { display: flex; width: 100%; justify-content: space-between; gap: 12px; font: inherit; color: #000;
  background: transparent; border: 0; border-radius: 0; padding: 3px 18px; text-align: left; cursor: pointer; }
.w95-menu button:hover, .w95-menu button:focus-visible { background: var(--w95-select); color: #fff; outline: none; }
`;

let styleEl: HTMLStyleElement | undefined;

/** Puts the Win95 CSS in the page once (idempotent). */
export function ensureW95(): void {
  if (styleEl?.isConnected) return;
  styleEl = document.createElement('style');
  styleEl.dataset.w95 = '';
  styleEl.textContent = W95_CSS;
  document.head.prepend(styleEl);
}

export interface TitleButton {
  label: '?' | '_' | 'X';
  title: string;
  onClick: (e: MouseEvent) => void;
}

/**
 * A title bar: caption plus the small `?` `_` `X` buttons. Pressing a button doesn't start a drag
 * of whatever the bar belongs to.
 */
export function titleBar(
  caption: string,
  buttons: readonly TitleButton[],
): { bar: HTMLDivElement; caption: HTMLSpanElement } {
  const bar = document.createElement('div');
  bar.className = 'w95-titlebar';
  const cap = document.createElement('span');
  cap.className = 'w95-caption';
  cap.textContent = caption;
  bar.append(cap);
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = b.label === 'X' ? 'w95-tbtn close' : 'w95-tbtn';
    btn.textContent = b.label === '_' ? '–' : b.label;
    btn.title = b.title;
    btn.setAttribute('aria-label', b.title);
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      b.onClick(e);
    });
    bar.append(btn);
  }
  return { bar, caption: cap };
}
