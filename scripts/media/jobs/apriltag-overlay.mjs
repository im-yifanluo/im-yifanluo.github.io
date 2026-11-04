/**
 * apriltag-overlay ("Showing where each benchmark object goes, in AR"): tile and hero.
 *
 * The source is one frame of the object_rendering tool's own output window (live RealSense view + PyBullet guides
 * blended at α 0.6), taken losslessly from the Research Notebook PDF ("Different Orientations", 1345×1003): the door
 * fixture's guide stood upright in front of the UR5e, the arm and the table showing through it, and the selection-knob
 * guide on the table at the right. Nothing is drawn, removed or re-rendered: the tile is a crop and the hero the whole
 * frame, each with a light neutral grade (table pulled to grey, a mild 16 → 246 levels stretch, saturation 0.9).
 *
 * Registered in scripts/media/build.mjs as the `apriltag-overlay` job.
 */
import { join } from 'node:path';
import sharp from 'sharp';
import { WORK, h9, neutralise, plate, posters, roundCorners, stills } from '../lib.mjs';
import { source } from '../paths.mjs';

const FRAME = join(source('apriltag-overlay'), 'overlay-door-upright.png');
// a bare-table patch (no guide), used to pull the frame's white balance toward neutral
const PATCH = { left: 760, top: 600, width: 300, height: 120 };
const LEVELS = [16, 246];
const SAT = 0.9;
// the tile's crop (source px, 16:9): the green fixtures whole at the left, nothing cut at any edge
const TILE_CROP = { left: 400, top: 66, width: 944, height: 531 };

/** A light, global unsharp mask for the tile posters only (the 640×480 stream reads soft at tile size). */
const TILE_SHARPEN = { sigma: 0.8, m1: 0.5, m2: 2 };

/** The graded frame, written as a PNG at `width` (lanczos; `width` defaults to the crop's own).
 *  `crop` null = the whole frame, at its own aspect ratio; `sharpen` = sharp's sharpen() options, applied after the resize. */
async function graded(crop, out, width = crop?.width, { sharpen } = {}) {
  const [B, W] = LEVELS;
  const { gains } = await neutralise(FRAME, PATCH, 0.8);
  const a = gains.map((g) => (g * 255) / (W - B));
  const b = gains.map(() => (-B * 255) / (W - B));
  let img = sharp(FRAME);
  if (crop) img = img.extract(crop).resize(width, h9(width), { kernel: 'lanczos3' });
  else if (width) img = img.resize(width, null, { kernel: 'lanczos3' });
  if (sharpen) img = img.sharpen(sharpen);
  await img.linear(a, b).modulate({ saturation: SAT }).png().toFile(out);
  return { file: out, gains: gains.map((g) => Number(g.toFixed(4))) };
}

/** The `apriltag-overlay` job. */
export async function apriltagOverlay() {
  const tilePng = await graded(TILE_CROP, join(WORK, 'ar-tile-upright.png'), undefined, { sharpen: TILE_SHARPEN });
  const poster = await posters('apriltag-overlay', tilePng.file, [640, 944]);
  // Hero (project page, 880 CSS px): the WHOLE tool window (1345×1003, same grade), 90 % of the hero's height, centred
  // on the media plate (SURFACE), the Framelight hero's layout. At 1760×990 the frame is 1195×891, a 0.89× downscale,
  // never enlarged (a 1024×576 crop would be enlarged ≈3.6× at DPR 2). The printed AprilTag the caption names, the
  // see-through panel and the knob guide are all in view. Corners rounded 8 device px (the 4 px --radius at
  // the hero's 2× scale), like every other image box on the site.
  const heroW = 1760,
    heroH = h9(heroW),
    frameH = Math.round(heroH * 0.9);
  const meta = await sharp(FRAME).metadata();
  const frameW = Math.round((meta.width * frameH) / meta.height);
  const framePng = join(WORK, 'ar-hero-frame.png');
  await graded(null, framePng, frameW);
  const fm = await sharp(framePng).metadata(); // 1195×891
  const R = 8;
  const frame = await roundCorners(sharp(framePng), fm.width, fm.height, R);
  const heroPng = join(WORK, 'ar-hero-upright.png');
  await plate(heroW, heroH, [
    { input: frame, left: Math.round((heroW - fm.width) / 2), top: Math.round((heroH - fm.height) / 2) },
  ]).toFile(heroPng);
  const heroPoster = await posters('apriltag-overlay-hero', heroPng, [1280, 1760]);
  // The phone cut is the same whole window with no plate, full width (its own 4:3-ish aspect; PosterBox.astro gives the
  // hero box that ratio below 720 px), so a 390 phone shows it 350 CSS px wide, not 265. 704 and 1056 px are 2× and 3×
  // of 352 CSS px, both under the source's 1345 px (never enlarged).
  const phonePng = join(WORK, 'ar-hero-phone.png');
  await graded(null, phonePng, 1056);
  const phone = await stills('apriltag-overlay-hero-phone', phonePng, [704, 1056]);
  return { tile: { poster, loops: [] }, hero: { kind: 'still', poster: heroPoster, phone }, gains: tilePng.gains };
}
