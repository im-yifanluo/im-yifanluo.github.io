/**
 * apriltag-overlay ("Showing where each benchmark object goes, in AR"): tile and hero.
 *
 * The source is one frame of the object_rendering tool's own output window (live RealSense view + PyBullet renders
 * blended in), taken losslessly from the Research Notebook PDF (1345×990): four YCB objects (a drill, a bleach bottle,
 * a can and a mustard bottle) rendered on the lab table from the printed AprilTag's pose, with the UR5e behind them.
 * Nothing is drawn, removed or re-rendered: the tile and the hero are crops, each with a light neutral grade (table
 * pulled to grey, a mild 16 → 246 levels stretch, saturation 0.9).
 *
 * Registered in scripts/media/build.mjs as the `apriltag-overlay` job.
 */
import { join } from 'node:path';
import sharp from 'sharp';
import { WORK, h9, neutralise, posters } from '../lib.mjs';
import { source } from '../paths.mjs';

const FRAME = join(source('apriltag-overlay'), 'overlay-ycb-1.png');
// a bare-table patch (no render), used to pull the frame's white balance toward neutral
const PATCH = { left: 160, top: 470, width: 300, height: 90 };
const LEVELS = [16, 246];
const SAT = 0.9;
// the tile's crop (source px, 16:9): the arm, the rendered objects and the whole printed tag; it ends just above the
// robot's teach pendant
const TILE_CROP = { left: 90, top: 51, width: 1100, height: 619 };
// the hero's crop (16:9): wider, from the top of the frame to the same bottom edge
const HERO_CROP = { left: 56, top: 0, width: 1188, height: 668 };

/** A light, global unsharp mask for the tile posters only (the 640×480 stream reads soft at tile size). */
const TILE_SHARPEN = { sigma: 0.8, m1: 0.5, m2: 2 };

/** A crop of the graded frame, written as a 16:9 PNG at `width` (lanczos; defaults to the crop's own width);
 *  `sharpen` = sharp's sharpen() options, applied after the resize. */
async function graded(crop, out, width = crop.width, { sharpen } = {}) {
  const [B, W] = LEVELS;
  const { gains } = await neutralise(FRAME, PATCH, 0.8);
  const a = gains.map((g) => (g * 255) / (W - B));
  const b = gains.map(() => (-B * 255) / (W - B));
  let img = sharp(FRAME).extract(crop).resize(width, h9(width), { kernel: 'lanczos3' });
  if (sharpen) img = img.sharpen(sharpen);
  await img.linear(a, b).modulate({ saturation: SAT }).png().toFile(out);
  return { file: out, gains: gains.map((g) => Number(g.toFixed(4))) };
}

/** The `apriltag-overlay` job. */
export async function apriltagOverlay() {
  const tilePng = await graded(TILE_CROP, join(WORK, 'ar-tile.png'), 944, { sharpen: TILE_SHARPEN });
  const poster = await posters('apriltag-overlay', tilePng.file, [640, 944]);
  // Hero (project page, 880 CSS px): never enlarged past the crop's own 1188 px.
  const heroPng = await graded(HERO_CROP, join(WORK, 'ar-hero.png'));
  const heroPoster = await posters('apriltag-overlay-hero', heroPng.file, [880, 1188]);
  return { tile: { poster, loops: [] }, hero: { kind: 'still', poster: heroPoster }, gains: tilePng.gains };
}
