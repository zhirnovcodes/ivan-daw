// v1.2: Win95 look (docs/v1.2-redesign.md, "1. Look"). Tokens and building blocks: panels/w95.ts.
export const CANVAS_CSS = `
.ivd-canvas { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--w95-desk);
  font: 13px/1.2 var(--w95-font); color: #000; user-select: none; -webkit-user-select: none; -webkit-font-smoothing: none; }
.ivd-canvas.panning { cursor: move; }
.ivd-world { position: absolute; inset: 0; pointer-events: none; transform-origin: 0 0; }
.ivd-nodes .ivd-node { pointer-events: auto; }
.ivd-cables { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.ivd-cable { fill: none; stroke-width: 2; stroke-linecap: butt; stroke-dasharray: 4 3; }
.ivd-cable.audio { stroke: var(--c-audio); }
.ivd-cable.events { stroke: var(--c-midi); }
.ivd-cable.modulation { stroke: var(--c-arm); }
.ivd-cable.selected { stroke-width: 4; stroke-dasharray: none; }
.ivd-cable.temp { pointer-events: none; }
.ivd-hit { fill: none; stroke: transparent; stroke-width: 12; pointer-events: stroke; cursor: pointer; }
.ivd-x { cursor: pointer; pointer-events: all; }
.ivd-x circle { fill: var(--w95-face); stroke: #000; stroke-width: 1; }
.ivd-x text { fill: #000; font: 13px var(--w95-font); text-anchor: middle; dominant-baseline: central; }
.ivd-node { position: absolute; left: 0; top: 0; width: 180px; box-sizing: border-box; background: var(--w95-face);
  box-shadow: var(--w95-raised); }
.ivd-node.selected { outline: 1px dotted #000; outline-offset: 2px; }
.ivd-header { position: absolute; left: 3px; right: 3px; top: 3px; height: 20px; box-sizing: border-box; padding: 0 2px 0 4px;
  display: flex; align-items: center; gap: 4px; background: var(--w95-title); color: var(--w95-title-text);
  cursor: grab; touch-action: none; }
.ivd-header:active { cursor: grabbing; }
.ivd-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ivd-dot { width: 8px; height: 8px; background: var(--w95-shadow); box-shadow: inset 1px 1px #000; flex: none; }
.ivd-dot.ready { background: #00c000; }
.ivd-dot.error { background: var(--c-audio); }
.ivd-port { position: absolute; width: 90px; height: 22px; display: flex; align-items: center; font-size: 13px; color: #000; }
.ivd-port.in { left: 0; padding-left: 12px; }
.ivd-port.out { right: 0; padding-right: 12px; justify-content: flex-end; }
.ivd-port i { position: absolute; top: 5px; width: 12px; height: 12px; box-sizing: border-box; border-radius: 50%;
  background: var(--c); box-shadow: inset 1px 1px rgba(0,0,0,0.6), inset -1px -1px rgba(255,255,255,0.5); }
.ivd-port.audio { --c: var(--c-audio); }
.ivd-port.events { --c: var(--c-midi); }
.ivd-port.modulation { --c: var(--c-arm); }
.ivd-port.in i { left: -6px; }
.ivd-port.out i { right: -6px; cursor: crosshair; touch-action: none; }
.ivd-port.valid i { box-shadow: 0 0 0 2px #fff, 0 0 0 3px #000; }
.ivd-port.invalid { opacity: 0.35; }
.ivd-ui { position: absolute; left: 0; overflow: hidden; background: transparent; color: #000;
  user-select: text; -webkit-user-select: text; cursor: auto; }
.ivd-foot { position: absolute; left: 6px; right: 6px; bottom: 6px; height: 44px; box-sizing: border-box; padding: 2px 8px;
  box-shadow: var(--w95-groove); display: flex; flex-direction: column; justify-content: center; gap: 0; }
.ivd-foot-row { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #000; text-transform: uppercase; }
.ivd-foot-row span { width: 56px; flex: none; }
.ivd-foot-row input { flex: 1; min-width: 0; }
.ivd-cable-label { fill: #fff; font: 13px var(--w95-font); text-anchor: end; pointer-events: none; }
.ivd-picker { position: absolute; z-index: 20; min-width: 180px; max-height: 300px; overflow-y: auto;
  background: var(--w95-face); box-shadow: var(--w95-raised); padding: 3px; }
.ivd-picker button { display: block; width: 100%; text-align: left; background: none; border: 0; color: #000;
  font: 13px var(--w95-font); padding: 3px 12px; border-radius: 0; cursor: pointer; }
.ivd-picker button:hover, .ivd-picker button:focus { background: var(--w95-select); color: #fff; outline: none; }
.ivd-picker-group { font-size: 13px; color: var(--w95-shadow); padding: 4px 6px 1px; }
.ivd-foot-row input:disabled { opacity: 0.4; }
.ivd-fold { flex: none; width: 16px; height: 14px; padding: 0; border: 0; border-radius: 0; background: var(--w95-face);
  box-shadow: var(--w95-raised); color: #000; font: 11px/14px var(--w95-font); cursor: pointer; }
.ivd-fold:active { box-shadow: var(--w95-pressed); }
.ivd-zoombar { position: absolute; left: 16px; bottom: 16px; z-index: 10; display: flex; align-items: center; gap: 2px;
  padding: 3px; background: var(--w95-face); box-shadow: var(--w95-raised); }
.ivd-zoombar button { font: 13px var(--w95-font); color: #000; background: var(--w95-face); border: 0; border-radius: 0;
  box-shadow: var(--w95-raised); height: 23px; cursor: pointer; padding: 0; }
.ivd-zoombar button:active { box-shadow: var(--w95-pressed); }
.ivd-zoombar button:focus-visible { outline: 1px dotted #000; outline-offset: -4px; }
.ivd-zoom-step { width: 23px; }
.ivd-zoombar .ivd-zoom { min-width: 52px; padding: 0 6px; background: var(--w95-field); box-shadow: var(--w95-sunken); }
.ivd-notes .ivd-note { pointer-events: auto; }
.ivd-note { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; gap: 2px; }
.ivd-note .w95-titlebar { cursor: grab; touch-action: none; flex: none; }
.ivd-note .w95-titlebar:active { cursor: grabbing; }
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
.ivd-toast { position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%); background: var(--w95-face); color: #000;
  box-shadow: var(--w95-raised); padding: 8px 14px; font: 13px var(--w95-font); z-index: 1000; pointer-events: none; }
`;
