// Slicing a 2x2 composite back into four usable images.
//
// The composite path generates four themes as one gridded image (one billed
// output image instead of four). To show or share a single theme, the grid has
// to be cut back apart — which is pure client-side canvas work: no API call, no
// cost, no network.
//
// The geometry is deliberately separated from the canvas so it can be tested.
// Canvas in jsdom is a stub; rectangle arithmetic is not, and the arithmetic is
// where an off-by-one would silently shave a face in half.

/**
 * Human-readable names for the quadrants, in the SAME order quadrantRects()
 * returns them and the same order api/_lib/roast-themes.ts assigns themes in.
 *
 * This lives here rather than in the component that displays it because the
 * ordering has already been duplicated once too often in this feature: a stale
 * second copy of a theme list shipped to production with an empty badge. An
 * ordering that exists once cannot disagree with itself.
 */
export const QUADRANT_LABELS = ['TOP LEFT', 'TOP RIGHT', 'LOWER LEFT', 'LOWER RIGHT'] as const;

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Where the four panes live inside a w x h composite, in TL, TR, BL, BR order —
 * matching QUADRANT_NAMES in api/_lib/roast-themes.ts, which is the order the
 * prompt assigns themes in. Getting this order wrong mislabels every result,
 * which is the kind of bug that looks like "the model ignored the prompt".
 *
 * `inset` trims each pane inward by that fraction of a half-dimension. Image
 * models do not honour a "no borders, no gutters" instruction perfectly, and a
 * pane sliced at exactly 50% can carry a sliver of its neighbour or a seam
 * line down one edge. A small inset costs a little framing and removes that
 * whole class of artefact. 0 gives exact mathematical quarters.
 */
export const quadrantRects = (w: number, h: number, inset = 0.015): Rect[] => {
    const halfW = w / 2;
    const halfH = h / 2;
    const dx = halfW * inset;
    const dy = halfH * inset;

    const cells: Array<[number, number]> = [
        [0, 0], // top-left
        [1, 0], // top-right
        [0, 1], // bottom-left
        [1, 1], // bottom-right
    ];

    return cells.map(([col, row]) => ({
        x: col * halfW + dx,
        y: row * halfH + dy,
        w: halfW - dx * 2,
        h: halfH - dy * 2,
    }));
};

/** Load a data URL into an HTMLImageElement. */
const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not decode composite image'));
        img.src = src;
    });

/**
 * Cut a 2x2 composite into four PNG data URLs, in TL, TR, BL, BR order.
 * Returns fewer than four only if the canvas context is unavailable.
 */
export const cropQuadrants = async (dataUrl: string, inset = 0.015): Promise<string[]> => {
    const img = await loadImage(dataUrl);
    const rects = quadrantRects(img.naturalWidth, img.naturalHeight, inset);

    return rects.map((r) => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(r.w);
        canvas.height = Math.round(r.h);
        const ctx = canvas.getContext('2d');
        if (!ctx) return dataUrl;
        ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
    });
};
