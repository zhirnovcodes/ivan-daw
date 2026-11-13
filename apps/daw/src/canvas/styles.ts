export const CANVAS_CSS = `
.ivd-canvas { position: relative; width: 100%; height: 100%; overflow: hidden; background-color: #17181c;
  background-image: radial-gradient(#2a2c33 1px, transparent 1px); background-size: 24px 24px;
  font: 13px system-ui, sans-serif; color: #e6e6ea; user-select: none; -webkit-user-select: none; }
.ivd-canvas.panning { cursor: move; }
.ivd-world { position: absolute; inset: 0; pointer-events: none; transform-origin: 0 0; }
.ivd-nodes .ivd-node { pointer-events: auto; }
.ivd-cables { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.ivd-cable { fill: none; stroke-width: 2.5; stroke-linecap: round; }
.ivd-cable.audio { stroke: #4fc3f7; }
.ivd-cable.events { stroke: #ffb74d; stroke-dasharray: 7 5; }
.ivd-cable.modulation { stroke: #ce93d8; stroke-dasharray: 2 5; }
.ivd-cable.selected { stroke-width: 4.5; }
.ivd-cable.temp { opacity: 0.8; pointer-events: none; }
.ivd-hit { fill: none; stroke: transparent; stroke-width: 12; pointer-events: stroke; cursor: pointer; }
.ivd-x { cursor: pointer; pointer-events: all; }
.ivd-x circle { fill: #2b2d34; stroke: #e6e6ea; stroke-width: 1.5; }
.ivd-x text { fill: #e6e6ea; font: 14px system-ui, sans-serif; text-anchor: middle; dominant-baseline: central; }
.ivd-node { position: absolute; left: 0; top: 0; width: 180px; box-sizing: border-box; background: #2b2d34;
  border: 1px solid #44474f; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
.ivd-node.selected { border-color: #8ab4f8; box-shadow: 0 0 0 1px #8ab4f8, 0 2px 8px rgba(0,0,0,0.4); }
.ivd-header { height: 28px; box-sizing: border-box; padding: 0 8px; display: flex; align-items: center; gap: 8px;
  background: #373a43; border-radius: 5px 5px 0 0; cursor: grab; touch-action: none; }
.ivd-header:active { cursor: grabbing; }
.ivd-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.ivd-dot { width: 9px; height: 9px; border-radius: 50%; background: #8a8d96; flex: none; }
.ivd-dot.ready { background: #66bb6a; }
.ivd-dot.error { background: #ef5350; }
.ivd-port { position: absolute; width: 90px; height: 22px; display: flex; align-items: center; font-size: 12px; color: #c4c6cc; }
.ivd-port.in { left: 0; padding-left: 12px; }
.ivd-port.out { right: 0; padding-right: 12px; justify-content: flex-end; }
.ivd-port i { position: absolute; top: 5px; width: 12px; height: 12px; box-sizing: border-box; border-radius: 50%;
  border: 2px solid var(--c); background: transparent; }
.ivd-port.audio { --c: #4fc3f7; }
.ivd-port.events { --c: #ffb74d; }
.ivd-port.modulation { --c: #ce93d8; }
.ivd-port.audio i { background: var(--c); }
.ivd-port.in i { left: -6px; }
.ivd-port.out i { right: -6px; cursor: crosshair; touch-action: none; }
.ivd-port.valid i { box-shadow: 0 0 0 3px rgba(255,255,255,0.35), 0 0 10px 3px var(--c); }
.ivd-port.invalid { opacity: 0.25; }
.ivd-foot { position: absolute; left: 0; right: 0; bottom: 0; height: 52px; box-sizing: border-box; padding: 4px 10px;
  border-top: 1px solid #44474f; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
.ivd-foot-row { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #c4c6cc; }
.ivd-foot-row span { width: 26px; flex: none; }
.ivd-foot-row input { flex: 1; min-width: 0; height: 16px; margin: 0; accent-color: #8ab4f8; }
.ivd-toast { position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%); background: #3b2a2a; color: #ffd7d7;
  border: 1px solid #ef5350; border-radius: 6px; padding: 8px 14px; font: 13px system-ui, sans-serif; z-index: 1000; pointer-events: none; }
`;
