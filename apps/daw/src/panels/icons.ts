// v1.2 top panel icons: original 32 × 32 pixel art in the Win95 style (docs/v1.2-redesign.md, "3. Fixed panels").
// Drawn with crisp-edged rects so they stay sharp; no third-party artwork.

const px = (rects: readonly (readonly [number, number, number, number, string])[]): string =>
  rects
    .map(([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`)
    .join('');

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;

/** A small plugin window with a MIDI in (yellow), an ARM in (blue) and an audio out (red), and a "+" badge. */
export const ICON_ADD_PLUGIN = svg(
  px([
    // window: black outline, grey face, white / dark bevel
    [3, 5, 24, 21, '#000'],
    [4, 6, 22, 19, '#fff'],
    [5, 7, 21, 18, '#808080'],
    [5, 7, 20, 17, '#c0c0c0'],
    // title bar
    [5, 7, 20, 4, '#030081'],
    [7, 8, 8, 2, '#fff'],
    [21, 8, 3, 2, '#c0c0c0'],
    // screen
    [9, 13, 12, 8, '#000'],
    [10, 14, 11, 7, '#fff'],
    [10, 14, 10, 6, '#387f81'],
    [12, 16, 2, 3, '#ffff80'],
    [15, 15, 2, 4, '#ffff80'],
    [18, 17, 1, 2, '#ffff80'],
    // connectors
    [1, 13, 4, 3, '#000'],
    [2, 14, 2, 1, '#fffc12'],
    [1, 18, 4, 3, '#000'],
    [2, 19, 2, 1, '#0600ff'],
    [26, 15, 4, 3, '#000'],
    [27, 16, 2, 1, '#fd0007'],
    // "+" badge
    [20, 20, 11, 11, '#000'],
    [21, 21, 9, 9, '#00a000'],
    [21, 21, 8, 8, '#40e040'],
    [24, 22, 3, 7, '#fff'],
    [22, 24, 7, 3, '#fff'],
  ]),
);

/** A yellow sticky note with a folded corner, ruled lines and a red pin. */
export const ICON_STICKY_NOTE = svg(
  px([
    // note body with outline
    [4, 4, 24, 25, '#000'],
    [5, 5, 22, 23, '#fff6a0'],
    [5, 5, 22, 3, '#ffe95a'],
    // folded corner (bottom right)
    [21, 23, 7, 6, '#387f81'],
    [21, 22, 1, 7, '#000'],
    [22, 22, 6, 1, '#000'],
    [22, 23, 5, 5, '#e0c040'],
    [22, 28, 1, 1, '#000'],
    [27, 23, 1, 1, '#000'],
    [23, 27, 1, 1, '#000'],
    [24, 26, 1, 1, '#000'],
    [25, 25, 1, 1, '#000'],
    [26, 24, 1, 1, '#000'],
    // ruled lines
    [8, 11, 16, 1, '#5a7ad0'],
    [8, 14, 16, 1, '#5a7ad0'],
    [8, 17, 16, 1, '#5a7ad0'],
    [8, 20, 11, 1, '#5a7ad0'],
    // pin
    [14, 1, 5, 5, '#000'],
    [15, 2, 3, 3, '#fd0007'],
    [15, 2, 1, 1, '#ff9090'],
    [16, 6, 1, 2, '#000'],
  ]),
);
