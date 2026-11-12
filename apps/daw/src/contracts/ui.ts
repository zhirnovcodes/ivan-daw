// Contract C5 (UI part). Owners: P5 (apps/daw/src/canvas) and P9 (apps/daw/src/panels).
// UI reads store signals and calls store actions, nothing else. It never touches audio.

/**
 * Renders one UI part into `root` and returns a function that removes it.
 * The app shell (P11) calls:
 *   canvas: `mountCanvas`
 *   panels: `mountTransportBar`, `mountNodePanel`, `mountAddMenu`
 */
export type MountUi = (root: HTMLElement) => () => void;
