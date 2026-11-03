/**
 * apriltag-overlay ("Showing where each benchmark object goes, in AR"): tile and hero.
 *
 * The source is one frame of the object_rendering tool's own output window (live RealSense view + PyBullet guides
 * blended at α 0.6), taken losslessly from the Research Notebook PDF ("Different Orientations", 1345×1003): the door
 * fixture's guide stood upright in front of the UR5e, the arm and the table showing through it, and the selection-knob
 * guide on the table at the right. Nothing is drawn, removed or re-rendered: the tile is a crop and the hero the whole
 * frame, each with a light neutral grade (table pulled to grey, a mild 16 → 246 levels stretch, saturation 0.9).
 *
 * Called from scripts/media/build.mjs (jobs['apriltag-overlay']) with its helpers.
 */
import { join } from 'node:path';
import sharp from 'sharp';
import { source } from '../paths.mjs';

const FRAME = join(source('apriltag-overlay'), 'overlay-door-upright.png');
// a bare-table patch (no guide), used to pull the frame's white balance toward neutral
const PATCH = { left: 760, top: 600, width: 300, height: 120 };
const LEVELS = [16, 246];
const SAT = 0.9;
// the tile's crop (source px, 16:9): the green fixtures whole at the left, nothing cut at any edge
const TILE_CROP = { left: 400, top: 66, width: 944, height: 531 };

/** Mean of a patch → per-channel gains that pull it `amount` of the way to its own grey. */
async function gainsOf(file, patch, amount = 0.8) {
  const { data, info } = await sharp(file).extract(patch).raw().toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += info.channels) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
  const mean = sum.map((s) => s / (data.length / info.channels));
  const grey = (mean[0] + mean[1] + mean[2]) / 3;
  return mean.map((m) => 1 + amount * (grey / m - 1));
}

/** A light, global unsharp mask for the tile posters only (the 640×480 stream reads soft at tile size). */
const TILE_SHARPEN = { sigma: 0.8, m1: 0.5, m2: 2 };

/** The graded frame, written as a PNG at `width` (lanczos; `width` defaults to the crop's own).
 *  `crop` null = the whole frame, at its own aspect ratio; `sharpen` = sharp's sharpen() options, applied after the resize. */
async function graded(crop, out, width = crop?.width, { sharpen } = {}) {
  const [B, W] = LEVELS;
  const gains = await gainsOf(FRAME, PATCH);
  const a = gains.map((g) => (g * 255) / (W - B));
  const b = gains.map(() => (-B * 255) / (W - B));
  let img = sharp(FRAME);
  if (crop) img = img.extract(crop).resize(width, Math.round((width * 9) / 16), { kernel: 'lanczos3' });
  else if (width) img = img.resize(width, null, { kernel: 'lanczos3' });
  if (sharpen) img = img.sharpen(sharpen);
  await img.linear(a, b).modulate({ saturation: SAT }).png().toFile(out);
  return { file: out, gains: gains.map((g) => Number(g.toFixed(4))) };
}

/** The build.mjs job. h = { WORK, SURFACE, h9, posters, stills } from scripts/media/build.mjs. */
export default async function apriltagOverlay(h) {
  const tilePng = await graded(TILE_CROP, join(h.WORK, 'ar-tile-upright.png'), undefined, { sharpen: TILE_SHARPEN });
  const poster = await h.posters('apriltag-overlay', tilePng.file, [640, 944]);
  // Hero (project page, 880 CSS px): the WHOLE tool window (1345×1003, same grade), 90 % of the hero's height, centred
  // on the media plate (SURFACE), the Framelight hero's layout. At 1760×990 the frame is 1195×891, a 0.89× downscale,
  // never enlarged (a 1024×576 crop would be enlarged ≈3.6× at DPR 2). The printed AprilTag the caption names, the
  // see-through panel and the knob guide are all in view. Corners rounded 8 device px (the 4 px --radius at
  // the hero's 2× scale), like every other image box on the site.
  const heroW = 1760, heroH = h.h9(heroW), frameH = Math.round(heroH * 0.9);
  const meta = await sharp(FRAME).metadata();
  const frameW = Math.round((meta.width * frameH) / meta.height);
  const framePng = join(h.WORK, 'ar-hero-frame.png');
  await graded(null, framePng, frameW);
  const fm = await sharp(framePng).metadata(); // 1195×891
  const R = 8;
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${fm.width}" height="${fm.height}"><rect width="${fm.width}" height="${fm.height}" rx="${R}" ry="${R}" fill="#fff"/></svg>`);
  const frame = await sharp(framePng).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const heroPng = join(h.WORK, 'ar-hero-upright.png');
  await sharp({ create: { width: heroW, height: heroH, channels: 3, background: h.SURFACE } })
    .composite([{ input: frame, left: Math.round((heroW - fm.width) / 2), top: Math.round((heroH - fm.height) / 2) }]).png().toFile(heroPng);
  const heroPoster = await h.posters('apriltag-overlay-hero', heroPng, [1280, 1760]);
  // The phone cut is the same whole window with no plate, full width (its own 4:3-ish aspect; Media.astro gives the hero
  // box that ratio below 720 px), so a 390 phone shows it 350 CSS px wide, not 265. 704 and 1056 px are 2× and 3× of
  // 352 CSS px, both under the source's 1345 px (never enlarged).
  const phonePng = join(h.WORK, 'ar-hero-phone.png');
  await graded(null, phonePng, 1056);
  const phone = await h.stills('apriltag-overlay-hero-phone', phonePng, [704, 1056]);
  return { tile: { poster, loops: [] }, hero: { kind: 'still', poster: heroPoster, phone }, gains: tilePng.gains };
}
