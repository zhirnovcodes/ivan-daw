// Small DOM helpers shared by the three panels.

import { PANELS_CSS } from './styles';

let styleEl: HTMLStyleElement | undefined;
export function ensureStyles(): void {
  if (styleEl?.isConnected) return;
  styleEl = document.createElement('style');
  styleEl.textContent = PANELS_CSS;
  document.head.appendChild(styleEl);
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
