/*
 * Positioning a photo inside the avatar circle.
 *
 * The upload took whatever file was picked and let CSS object-cover crop it
 * to the centre of the frame. For a phone photo held in portrait that means
 * the top of someone's head is cut off, which is the one part of a headshot
 * that must not be — and there was nothing the person could do about it.
 *
 * COORDINATES. The editor works in viewport pixels: a square of side
 * `viewport`, with the avatar circle inscribed in it. `scale` multiplies the
 * image's natural size, and `(x, y)` is where the scaled image's top-left
 * corner sits relative to the viewport's top-left. Negative values mean the
 * image extends past the edge, which is normal when zoomed in.
 *
 * Everything here is pure so the geometry can be tested without a DOM: the
 * bugs in a cropper are arithmetic, not rendering.
 */

export type Size = { width: number; height: number };
export type Transform = { scale: number; x: number; y: number };

/** Smallest scale that still COVERS the square — no empty space. */
export function coverScale(img: Size, viewport: number): number {
  if (img.width <= 0 || img.height <= 0) return 1;
  return Math.max(viewport / img.width, viewport / img.height);
}

/** Largest scale at which the WHOLE image fits inside the square. */
export function containScale(img: Size, viewport: number): number {
  if (img.width <= 0 || img.height <= 0) return 1;
  return Math.min(viewport / img.width, viewport / img.height);
}

/**
 * The zoom range offered.
 *
 * The minimum is `contain`, NOT `cover`. Being able to zoom out until the
 * entire photo is inside the circle is the explicit point of this editor —
 * someone whose photo would otherwise lose its subject can choose to show
 * all of it and accept the margin around it.
 */
export function zoomRange(img: Size, viewport: number): { min: number; max: number } {
  const min = containScale(img, viewport);
  // Four times cover is plenty to crop in on a face in a group photo, and
  // stops before the image turns to mush.
  return { min, max: Math.max(coverScale(img, viewport) * 4, min * 4) };
}

export function clampScale(scale: number, img: Size, viewport: number): number {
  const { min, max } = zoomRange(img, viewport);
  return Math.min(max, Math.max(min, scale));
}

/**
 * Keep the image somewhere sensible.
 *
 * Two regimes, because the sensible answer flips:
 *   - Larger than the viewport: don't let an edge drift inside it, or a
 *     blank wedge appears next to the face.
 *   - Smaller (zoomed out to show the whole photo): keep it fully within
 *     the viewport so it can't be dragged out of sight.
 */
export function clampOffset(t: Transform, img: Size, viewport: number): Transform {
  const w = img.width * t.scale;
  const h = img.height * t.scale;

  const axis = (pos: number, len: number): number => {
    if (len >= viewport) return Math.min(0, Math.max(viewport - len, pos));
    return Math.min(viewport - len, Math.max(0, pos));
  };

  return { scale: t.scale, x: axis(t.x, w), y: axis(t.y, h) };
}

/** Centre the image at a given scale. */
export function centered(img: Size, viewport: number, scale: number): Transform {
  return clampOffset(
    { scale, x: (viewport - img.width * scale) / 2, y: (viewport - img.height * scale) / 2 },
    img, viewport,
  );
}

/** The starting position: filling the circle, centred — what it did before. */
export function initialTransform(img: Size, viewport: number): Transform {
  return centered(img, viewport, coverScale(img, viewport));
}

/**
 * Zoom about a fixed point (the centre, or two fingers' midpoint) so the
 * thing under that point stays under it. Zooming about the origin instead
 * makes the image lurch away, which reads as the control being broken.
 */
export function zoomAbout(
  t: Transform, nextScale: number, focus: { x: number; y: number },
  img: Size, viewport: number,
): Transform {
  const scale = clampScale(nextScale, img, viewport);
  const ratio = scale / t.scale;
  return clampOffset(
    { scale, x: focus.x - (focus.x - t.x) * ratio, y: focus.y - (focus.y - t.y) * ratio },
    img, viewport,
  );
}

/**
 * Where to draw the image on the output canvas.
 *
 * The editor's square maps onto the exported square, so one factor converts
 * every coordinate. Returned separately from any drawing so the mapping can
 * be asserted directly.
 */
export function outputRect(
  t: Transform, img: Size, viewport: number, output: number,
): { x: number; y: number; width: number; height: number } {
  const f = output / viewport;
  return {
    x: t.x * f,
    y: t.y * f,
    width: img.width * t.scale * f,
    height: img.height * t.scale * f,
  };
}

/** Does any part of the circle have no image behind it at this position? */
export function hasEmptySpace(t: Transform, img: Size, viewport: number): boolean {
  const w = img.width * t.scale;
  const h = img.height * t.scale;
  return w < viewport - 0.5 || h < viewport - 0.5;
}
