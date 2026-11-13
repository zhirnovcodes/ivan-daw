// Where a new node goes. Pure function.

export const PLACE_STEP = 24;

interface Pt {
  x: number;
  y: number;
}

/**
 * The canvas centre, moved 24 px right and down for each node already at that spot,
 * so new nodes fan out instead of stacking on each other.
 */
export function placeNode(center: Pt, nodes: readonly Pt[]): Pt {
  const x0 = Math.round(center.x);
  const y0 = Math.round(center.y);
  let k = 0;
  while (nodes.some((n) => n.x === x0 + k * PLACE_STEP && n.y === y0 + k * PLACE_STEP)) k++;
  return { x: x0 + k * PLACE_STEP, y: y0 + k * PLACE_STEP };
}
