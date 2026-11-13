// Black on white, system font, no theming. Class prefix: ivp-.
export const PANELS_CSS = `
.ivp-bar, .ivp-node, .ivp-menu { font: 13px system-ui, sans-serif; color: #000; background: #fff; box-sizing: border-box; }
.ivp-bar { height: 48px; display: flex; align-items: center; gap: 12px; padding: 0 12px; border-bottom: 1px solid #000; }
.ivp-bar button, .ivp-node button, .ivp-menu button { font: inherit; color: #000; background: #fff; border: 1px solid #000;
  border-radius: 4px; padding: 4px 12px; cursor: pointer; }
.ivp-bar button:hover, .ivp-node button:hover, .ivp-menu button:hover { background: #eee; }
.ivp-bar button:focus-visible, .ivp-node button:focus-visible, .ivp-menu button:focus-visible { outline: 2px solid #000; outline-offset: 1px; }
.ivp-play { min-width: 64px; }
.ivp-bpm { display: flex; align-items: center; gap: 6px; }
.ivp-bpm input { width: 64px; font: inherit; color: #000; background: #fff; border: 1px solid #000; border-radius: 4px; padding: 3px 6px; }
.ivp-beat { font-variant-numeric: tabular-nums; min-width: 72px; }
.ivp-spacer { flex: 1; }
.ivp-node { width: 260px; height: 100%; overflow-y: auto; padding: 12px; border-left: 1px solid #000; display: flex; flex-direction: column; gap: 10px; }
.ivp-node[hidden] { display: none; }
.ivp-title { font-size: 15px; font-weight: 600; }
.ivp-kind { font-weight: 400; color: #444; }
.ivp-status { color: #444; }
.ivp-status.error { color: #000; font-weight: 600; }
.ivp-err { border: 1px solid #000; padding: 6px 8px; border-radius: 4px; word-break: break-word; }
.ivp-sect { font-weight: 600; margin-top: 4px; border-top: 1px solid #ccc; padding-top: 8px; }
.ivp-src { grid-column: 1 / -1; font-size: 11px; color: #6a1b9a; }
.ivp-src:empty { display: none; }
.ivp-row.ivp-bound input, .ivp-row.ivp-bound button { opacity: 0.45; }
.ivp-row { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; }
.ivp-row label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ivp-val { font-variant-numeric: tabular-nums; color: #444; text-align: right; }
.ivp-row input[type=range] { grid-column: 1 / -1; width: 100%; margin: 0; accent-color: #000; }
.ivp-row select { grid-column: 1 / -1; font: inherit; color: #000; background: #fff; border: 1px solid #000; border-radius: 4px; padding: 3px; }
.ivp-stepper { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; }
.ivp-stepper span { min-width: 3ch; text-align: center; font-variant-numeric: tabular-nums; }
.ivp-note { color: #444; }
.ivp-remove { margin-top: 8px; align-self: flex-start; }
.ivp-menu { position: fixed; top: 52px; right: 8px; width: 240px; max-height: 70vh; overflow-y: auto; border: 1px solid #000;
  border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); padding: 4px; z-index: 900; }
.ivp-menu[hidden] { display: none; }
.ivp-menu button { display: flex; width: 100%; justify-content: space-between; gap: 8px; border: 0; text-align: left; border-radius: 2px; }
.ivp-menu .ivp-kind { font-size: 12px; }
.ivp-menu .ivp-note { padding: 6px 8px; }
`;
