import sharp from 'sharp';

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Adds a drop shadow behind the non-transparent areas of an image, using
 * only the `sharp` library (no Jimp / @jimp/plugin-shadow needed).
 *
 * The output has the SAME dimensions as the source image — the shadow is
 * drawn within the existing canvas (and clipped at the edges if the blur
 * or offset would push it outside), rather than growing the canvas.
 *
 * How it works:
 *  1. Extract the source image's alpha channel — this is the "shape" mask.
 *  2. Scale that mask by the desired opacity.
 *  3. Paint a flat color rectangle and stamp the scaled mask on as its alpha
 *     channel, so it's a solid-color silhouette of the original artwork.
 *  4. Pad it with transparent space and blur it, to get a soft shadow
 *     (padding first avoids the blur being clipped while it's generated).
 *  5. Crop that padded/blurred/offset shadow back down to the region that
 *     overlaps the original canvas, and composite it under the original
 *     image on a canvas the same size as the source.
 *
 * @param {Buffer|string} input - Source image (buffer or file path). Should
 *   have (or be able to gain) an alpha channel.
 * @param {Object} [options]
 * @param {number} [options.blur=15]      - Gaussian blur sigma for the shadow.
 * @param {number} [options.offsetX=10]   - Horizontal shadow offset in px.
 * @param {number} [options.offsetY=10]   - Vertical shadow offset in px.
 * @param {number} [options.opacity=0.5]  - Shadow opacity, 0-1.
 * @param {string} [options.color='#000000'] - Shadow color as a hex string.
 * @returns {Promise<Buffer>} PNG buffer, same width/height as the source,
 *   with the original image composited over its shadow.
 */
async function addDropShadow(src, options = {}) {
  const {
    blur = 2,
    offsetX = 1,
    offsetY = 1,
    opacity = 0.5,
    color = '#000000',
  } = options;

  const { width, height } = await src.metadata();
  const { r, g, b } = hexToRgb(color);

  // 1. Pull out the alpha channel as raw pixel data — this is the shape mask.
  const alpha = await src.clone().extractChannel('alpha').raw().toBuffer();

  // 2. Flat-color rectangle + the scaled mask joined on as its alpha channel
  //    => a solid-color silhouette of the artwork.
  const shadowShape = await sharp({
    create: { width, height, channels: 3, background: { r, g, b } },
  })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();

  // 3. Pad with transparent space so blur has room to spread without being
  //    clipped at the edges, then blur to soften it into a shadow.
  const pad = Math.ceil(blur * 3);
  const blurredShadow = await sharp(shadowShape)
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .blur(blur)
    .toBuffer();
  const shadowWidth = width + pad * 2;
  const shadowHeight = height + pad * 2;

  // 4. The padded shadow buffer's (pad, pad) pixel lines up with the source
  //    image's (0, 0) pixel when offset is (0, 0). Applying offsetX/Y shifts
  //    the buffer's top-left corner to (offsetX - pad, offsetY - pad) in the
  //    source image's coordinate space. Work out the overlap with the
  //    source canvas [0, width) x [0, height) so we can crop + place it
  //    without growing the canvas.
  const bufferLeft = offsetX - pad;
  const bufferTop = offsetY - pad;

  const compositeLeft = Math.max(0, bufferLeft);
  const compositeTop = Math.max(0, bufferTop);
  const extractLeft = Math.max(0, -bufferLeft);
  const extractTop = Math.max(0, -bufferTop);
  const extractWidth = Math.min(bufferLeft + shadowWidth, width) - compositeLeft;
  const extractHeight = Math.min(bufferTop + shadowHeight, height) - compositeTop;

  const originalBuffer = await src.clone().png().toBuffer();

  const composites = [];
  if (extractWidth > 0 && extractHeight > 0) {
    const croppedShadow = await sharp(blurredShadow)
      .extract({
        left: extractLeft,
        top: extractTop,
        width: extractWidth,
        height: extractHeight,
      })
      .toBuffer();
    composites.push({ input: croppedShadow, left: compositeLeft, top: compositeTop });
  }
  composites.push({ input: originalBuffer, left: 0, top: 0 });

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png();
}

export default addDropShadow;