// The Space-key rule. Pure: takes plain data, not a DOM event.

export interface KeyInfo {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  /** The focused element's tag, lower case; '' when focus is on the page. */
  tag: string;
  /** The `type` of an input element. */
  inputType?: string;
  isContentEditable?: boolean;
}

/** Inputs where Space does nothing on its own, so it may toggle Play. */
const SPACE_FREE_INPUTS = new Set(['range']);

/**
 * Space toggles Play / Pause unless focus is somewhere Space already means something:
 * a text field (it types a space), or a button, checkbox or menu (it presses or opens them).
 */
export function shouldTogglePlay(k: KeyInfo): boolean {
  if (k.key !== ' ' && k.key !== 'Spacebar') return false;
  if (k.ctrlKey || k.metaKey || k.altKey || k.repeat) return false;
  if (k.isContentEditable) return false;
  if (k.tag === 'input') return SPACE_FREE_INPUTS.has(k.inputType ?? '');
  return !(k.tag === 'textarea' || k.tag === 'select' || k.tag === 'button');
}
