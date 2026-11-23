// v1.2: Win95 look (docs/v1.2-redesign.md, "1. Look"). Tokens and building blocks: w95.ts. Class prefix: ivp-.
export const PANELS_CSS = `
.ivp-bar, .ivp-node, .ivp-menu { font: 13px/1.2 var(--w95-font); color: #000; background: var(--w95-face);
  box-sizing: border-box; -webkit-font-smoothing: none; }
.ivp-bar { height: 100%; display: flex; align-items: center; gap: 8px; padding: 0 8px; }
.ivp-bar .ivp-icon-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  min-width: 72px; height: 54px; padding: 3px 6px; }
.ivp-bar .ivp-icon-btn:active:not(:disabled) { padding: 4px 5px 2px 7px; }
.ivp-bar .ivp-icon-btn:disabled .ivp-icon { opacity: 0.45; filter: grayscale(1); }
.ivp-bar .ivp-icon-btn:disabled { color: var(--w95-shadow); text-shadow: 1px 1px var(--w95-light); cursor: default; }
.ivp-bar .ivp-icon-btn[hidden] { display: none; }
.ivp-icon { width: 32px; height: 32px; display: block; }
.ivp-icon svg { display: block; }
.ivp-caption { white-space: nowrap; }
.ivp-sep { width: 2px; align-self: stretch; margin: 6px 4px; box-shadow: var(--w95-groove); }
.ivp-bar button, .ivp-node button, .ivp-menu button { font: inherit; color: #000; background: var(--w95-face); border: 0;
  border-radius: 0; box-shadow: var(--w95-raised); padding: 4px 12px; min-height: 23px; cursor: pointer; }
.ivp-bar button:active, .ivp-node button:active { box-shadow: var(--w95-pressed); }
.ivp-bar button:focus-visible, .ivp-node button:focus-visible { outline: 1px dotted #000; outline-offset: -5px; }
.ivp-play { min-width: 64px; }
.ivp-bpm { display: flex; align-items: center; gap: 8px; }
.ivp-bpm input { width: 56px; text-align: left; font: inherit; color: #000; background: var(--w95-field); border: 0; border-radius: 0;
  box-shadow: var(--w95-sunken); padding: 3px 5px; height: 21px; box-sizing: border-box; outline: none; -moz-appearance: textfield; }
.ivp-bpm input::-webkit-inner-spin-button, .ivp-bpm input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.ivp-beat { min-width: 48px; height: 21px; box-sizing: border-box; padding: 3px 6px; box-shadow: var(--w95-sunken); }
.ivp-spacer { flex: 1; }
.ivp-node { width: 260px; height: 100%; overflow-y: auto; padding: 12px; box-shadow: var(--w95-raised);
  display: flex; flex-direction: column; gap: 10px; }
.ivp-node[hidden] { display: none; }
.ivp-title { font-size: 13px; background: var(--w95-title); color: #fff; padding: 2px 4px; margin: -9px -9px 0; }
.ivp-kind { color: inherit; opacity: 0.8; }
.ivp-status { color: #000; }
.ivp-status.error { color: #000; font-weight: 700; }
.ivp-err { background: var(--w95-field); box-shadow: var(--w95-sunken); padding: 6px 8px; word-break: break-word; }
.ivp-sect { margin-top: 4px; box-shadow: 0 -1px var(--w95-shadow), 0 -2px 0 -1px var(--w95-light) inset; padding-top: 8px; }
.ivp-src { grid-column: 1 / -1; color: var(--c-arm); }
.ivp-src:empty { display: none; }
.ivp-row.ivp-bound input, .ivp-row.ivp-bound button { opacity: 0.45; }
.ivp-row { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; }
.ivp-row label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ivp-val { font-variant-numeric: tabular-nums; text-align: right; }
.ivp-row input[type=range] { grid-column: 1 / -1; width: 100%; margin: 0; accent-color: var(--w95-title); }
.ivp-row select { grid-column: 1 / -1; font: inherit; color: #000; background: var(--w95-field); border: 0; border-radius: 0;
  box-shadow: var(--w95-sunken); padding: 3px; }
.ivp-stepper { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; }
.ivp-stepper span { min-width: 3ch; text-align: center; font-variant-numeric: tabular-nums; }
.ivp-note { color: #000; }
.ivp-remove { margin-top: 8px; align-self: flex-start; }
.ivp-menu { position: fixed; top: 80px; right: 16px; width: 240px; max-height: 70vh; overflow-y: auto;
  box-shadow: var(--w95-raised); padding: 3px; z-index: 900; }
.ivp-menu[hidden] { display: none; }
.ivp-menu button { display: flex; width: 100%; justify-content: space-between; gap: 8px; box-shadow: none; text-align: left;
  padding: 3px 12px; }
.ivp-menu button:hover, .ivp-menu button:focus-visible { background: var(--w95-select); color: #fff; outline: none; }
.ivp-menu .ivp-kind { opacity: 0.7; }
.ivp-menu .ivp-note { padding: 6px 8px; }
`;
