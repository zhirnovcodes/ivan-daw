// v1.2: Win95 look (docs/v1.2-redesign.md, "1. Look"). Tokens and building blocks: panels/w95.ts.
export const CANVAS_CSS = `
.ivd-canvas { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--w95-desk);
  font: 13px/1.2 var(--w95-font); color: #000; user-select: none; -webkit-user-select: none; -webkit-font-smoothing: none; }
.ivd-canvas.panning { cursor: move; }
.ivd-world { position: absolute; inset: 0; pointer-events: none; transform-origin: 0 0; }
.ivd-world > div { position: absolute; inset: 0; pointer-events: none; }
.ivd-nodes .ivd-node, .ivd-info > *, .ivd-notes .ivd-note { pointer-events: auto; }

/* Cables: dashed 2px; hover or selected → solid 4px. Above the windows. */
.ivd-cables { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.ivd-cable { fill: none; stroke-width: 2; stroke-linecap: butt; stroke-dasharray: 4 3; }
.ivd-cable.audio { stroke: var(--c-audio); }
.ivd-cable.events { stroke: var(--c-midi); }
.ivd-cable.modulation { stroke: var(--c-arm); }
.ivd-cable.modulation.invalid { stroke: var(--w95-shadow); }
.ivd-cable-g:hover .ivd-cable, .ivd-cable-g.selected .ivd-cable { stroke-width: 4; stroke-dasharray: none; }
.ivd-cable.temp { pointer-events: none; }
.ivd-hit { fill: none; stroke: transparent; pointer-events: stroke; cursor: pointer; }
.ivd-play .ivd-hit { pointer-events: none; }
.ivd-play .ivd-dot.out { cursor: default; }

/* Plugin windows */
.ivd-node { position: absolute; left: 0; top: 0; box-sizing: border-box; padding: 0; }
.ivd-node.selected { outline: 1px dotted #000; outline-offset: 1px; }
.ivd-node > .w95-titlebar { position: absolute; left: 4px; right: 4px; top: 4px; cursor: grab; touch-action: none; }
.ivd-node > .w95-titlebar:active { cursor: grabbing; }
.ivd-node.off > .w95-titlebar { background: var(--w95-shadow); color: var(--w95-face); }
.ivd-node.off .ivd-uiframe, .ivd-node.off .ivd-params { opacity: 0.55; }
.ivd-onoff { width: 12px; height: 12px; margin-right: 3px; }
.w95-tbtn:disabled { color: var(--w95-shadow); cursor: default; }
.ivd-chrome { position: absolute; inset: 0; pointer-events: none; }
.ivd-chrome > * { pointer-events: auto; }
.ivd-group { position: absolute; box-sizing: border-box; background: var(--w95-face); box-shadow: var(--w95-raised); }
.ivd-group-label { padding-top: 4px; white-space: pre; text-align: center; line-height: 11px; font-size: 13px; }
.ivd-dot { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; box-sizing: border-box; border-radius: 50%;
  background: var(--c); box-shadow: 0 0 0 1px #000, inset -2px -2px rgba(0,0,0,0.35), inset 2px 2px rgba(255,255,255,0.45); }
.ivd-dot.midi { --c: var(--c-midi); }
.ivd-dot.audio { --c: var(--c-audio); }
.ivd-dot.arm { --c: var(--c-arm); }
.ivd-dot.out { cursor: crosshair; touch-action: none; }
.ivd-dot.valid { box-shadow: 0 0 0 1px #000, 0 0 0 3px #fff, 0 0 0 4px #000; }
.ivd-dot.invalid { opacity: 0.35; }
.ivd-dot-num { position: absolute; transform: translateX(-50%); font-size: 13px; line-height: 12px; pointer-events: none; }
.ivd-pager { position: absolute; display: flex; gap: 2px; }
.ivd-pager .w95-tbtn { width: 17px; height: 16px; line-height: 16px; }
.ivd-uiframe { position: absolute; box-sizing: border-box; box-shadow: var(--w95-sunken); background: var(--w95-face); }
.ivd-ui { position: absolute; overflow: hidden; background: transparent; color: #000;
  user-select: text; -webkit-user-select: text; cursor: auto; }
.ivd-params { position: absolute; box-sizing: border-box; padding: 4px 6px; box-shadow: var(--w95-groove); }
.ivd-foot { position: absolute; box-sizing: border-box; padding: 3px 8px; box-shadow: var(--w95-groove);
  display: flex; flex-direction: column; justify-content: center; }
.ivd-foot-row { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #000; text-transform: uppercase; }
.ivd-foot-row span { width: 56px; flex: none; }
.ivd-foot-row input { flex: 1; min-width: 0; }
.ivd-foot-row input:disabled { opacity: 0.4; }

/* Connection window (connector info layer) */
.ivd-conn { position: absolute; left: 0; top: 0; width: 240px; display: flex; flex-direction: column; gap: 2px; }
.ivd-conn-body { padding: 6px 4px 4px; display: flex; flex-direction: column; gap: 4px; }
.ivd-conn-row { display: flex; align-items: center; gap: 6px; }
.ivd-conn-label { width: 34px; flex: none; }
.ivd-conn-row .w95-select { flex: 1; min-width: 0; }
.ivd-conn-row .w95-range { flex: 1; min-width: 0; }
.ivd-conn-pct { width: 48px; flex: none; }

/* Sticky notes and plugin info notes (notes layer) */
.ivd-note { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; gap: 2px; }
.ivd-note .w95-titlebar { cursor: grab; touch-action: none; flex: none; }
.ivd-note .w95-titlebar:active { cursor: grabbing; }
.ivd-info-note { width: 280px; max-height: 320px; }
.ivd-info-note .w95-titlebar { cursor: default; }
.ivd-note-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 8px 10px; box-sizing: border-box;
  background: var(--w95-note); box-shadow: var(--w95-sunken); white-space: pre-wrap; overflow-wrap: anywhere;
  user-select: text; -webkit-user-select: text; cursor: text; }
.ivd-note-body a { color: var(--w95-link); }
.ivd-note-body b { font-weight: 700; }
.ivd-note-edit { display: block; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; resize: none; outline: none;
  background: transparent; font: inherit; color: #000; box-sizing: border-box; }
.ivd-note-body:has(.ivd-note-edit) { padding: 0; }
.ivd-note-body:has(.ivd-note-edit) .ivd-note-edit { padding: 8px 10px; }
.ivd-note-grip { position: absolute; right: 2px; bottom: 2px; width: 12px; height: 12px; cursor: nwse-resize; touch-action: none;
  background: linear-gradient(135deg, transparent 0 45%, #fff 45% 52%, var(--w95-shadow) 52% 62%, transparent 62% 70%,
    #fff 70% 77%, var(--w95-shadow) 77% 87%, transparent 87%); }

/* Zoom panel, bottom-left */
.ivd-zoombar { position: absolute; left: 16px; bottom: 16px; z-index: 10; display: flex; align-items: center; gap: 2px;
  padding: 3px; background: var(--w95-face); box-shadow: var(--w95-raised); }
.ivd-zoombar button { font: 13px var(--w95-font); color: #000; background: var(--w95-face); border: 0; border-radius: 0;
  box-shadow: var(--w95-raised); height: 23px; cursor: pointer; padding: 0; }
.ivd-zoombar button:active { box-shadow: var(--w95-pressed); }
.ivd-zoombar button:focus-visible { outline: 1px dotted #000; outline-offset: -4px; }
.ivd-zoom-step { width: 23px; }
.ivd-zoombar .ivd-zoom { width: 52px; box-sizing: border-box; padding: 0 6px; background: var(--w95-field); box-shadow: var(--w95-sunken); }

.ivd-toast { position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%); background: var(--w95-face); color: #000;
  box-shadow: var(--w95-raised); padding: 8px 14px; font: 13px var(--w95-font); z-index: 1000; pointer-events: none; }
`;
