#!/usr/bin/env node
/**
 * Put a real photo in the homepage portrait box.
 *
 *   npm run media:portrait -- <photo> [--crop left,top,side | --focus 50%,32%]
 *   npm run media:portrait -- --remove
 *
 * Writes public/media/portrait-{160,320,480,640}.{avif,webp} (MEDIA_OUT; 1:1, AVIF q55 and WebP q80, lanczos3, never
 * upscaled, all metadata dropped) and src/generated/portrait.json, which src/pages/index.astro reads at build time: a
 * <picture> in the same 1:1 box as the tiles (320 px desktop, 240 tablet, 160 phone), eager, fetchpriority high, with
 * the site's radius and 1 px inner hairline. Portrait files of widths it no longer writes are deleted.
 *
 *   --crop   an exact square in source pixels. Use it for a square source, where --focus cannot move the window.
 *            The current photo ($MEDIA_SRC/portrait/Profile-Pic-New.png, 1254²) uses `--crop 29,56,1198`, which puts
 *            the eyes at 40 % and keeps 5 % headroom.
 *   --focus  in a non-square source, the point (x%,y% of the photo) the square window keeps in view: centred across,
 *            and 38 % from the window's top.
 *   --remove deletes the manifest and the portrait files in MEDIA_OUT; the quiet placeholder returns on the next build.
 *
 * The manifest also records the photo's backdrop (`bg`: its top-edge and middle-edge colours, sampled at the left edge),
 * which the box paints until the image decodes, so the box never flashes grey under a coloured backdrop.
 * Exit codes: 0 done, 1 a failed step, 2 a usage error (bad arguments, a missing photo, a crop that does not fit).
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MEDIA_OUT, PORTRAIT_MANIFEST } from './paths.mjs';

const OUT = MEDIA_OUT;
const MANIFEST = PORTRAIT_MANIFEST;
const WIDTHS = [160, 320, 480, 640];
const USAGE = `usage: npm run media:portrait -- <photo> [--crop left,top,side | --focus 50%,32%]
       npm run media:portrait -- --remove
  --crop    an exact square in source pixels
  --focus   the point the square window keeps in view, centred across and 38 % from its top (default 50%,32%)
  --remove  delete src/generated/portrait.json and the portrait files in MEDIA_OUT (the placeholder returns on the next
            build)
  -h, --help  show this text`;

/** The portrait files in OUT (portrait-<width>.avif / .webp). */
const portraitFiles = () =>
  existsSync(OUT) ? readdirSync(OUT).filter((f) => /^portrait-\d+\.(avif|webp)$/.test(f)) : [];

/** The arguments → { help } | { remove } | { src, crop?, focus? } | { error }. */
function parseArgs(argv) {
  const out = {};
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') return { help: true };
    if (a === '--remove') out.remove = true;
    else if (a === '--crop' || a === '--focus') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) return { error: `${a} needs a value` };
      out[a.slice(2)] = v;
    } else if (a.startsWith('-')) return { error: `unknown option: ${a}` };
    else files.push(a);
  }
  if (out.remove)
    return files.length || out.crop || out.focus ? { error: '--remove takes no other arguments' } : { remove: true };
  if (files.length !== 1) return { error: files.length ? 'one photo at a time' : 'no photo given' };
  if (!existsSync(files[0])) return { error: `${files[0]}: no such file` };
  return { ...out, src: files[0] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.error) {
    console.error(`media:portrait: ${args.error}\n\n${USAGE}`);
    return 2;
  }
  if (args.remove) {
    const files = portraitFiles();
    for (const f of files) rmSync(join(OUT, f));
    rmSync(MANIFEST, { force: true });
    console.log(`removed ${MANIFEST} and ${files.length} portrait files from ${OUT}`);
    console.log('the placeholder returns on the next build');
    return 0;
  }

  const img = sharp(args.src).rotate(); // honour EXIF orientation; sharp drops all metadata (location, camera) on output
  const { width, height } = await img.metadata();
  let left, top, side;
  if (args.crop) {
    [left, top, side] = args.crop.split(',').map(Number);
    if (
      ![left, top, side].every(Number.isInteger) ||
      left < 0 ||
      top < 0 ||
      left + side > width ||
      top + side > height
    ) {
      console.error(`media:portrait: --crop ${args.crop} does not fit a ${width}×${height} photo`);
      return 2;
    }
  } else {
    const [fx, fy] = (args.focus ?? '50%,32%').split(',').map((v) => parseFloat(v) / 100);
    side = Math.min(width, height);
    left = Math.round(Math.min(width - side, Math.max(0, fx * width - side / 2)));
    top = Math.round(Math.min(height - side, Math.max(0, fy * height - side * 0.38)));
  }
  const square = await img.extract({ left, top, width: side, height: side }).png().toBuffer();

  /** The backdrop's colour in a small patch at the left edge, `y` of the way down. */
  async function backdrop(y) {
    const n = Math.max(4, Math.round(side * 0.02));
    const { data } = await sharp(square)
      .extract({ left: 0, top: Math.min(side - n, Math.round(side * y)), width: n, height: n })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const avg = [0, 1, 2].map((c) =>
      Math.round(data.filter((_, i) => i % 3 === c).reduce((a, b) => a + b, 0) / (data.length / 3)),
    );
    return `#${avg
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()}`;
  }

  mkdirSync(OUT, { recursive: true });
  const widths = WIDTHS.filter((w) => w <= side);
  const out = {
    avif: [],
    webp: [],
    src: '',
    w: widths.at(-1),
    h: widths.at(-1),
    position: '50% 50%',
    bg: [await backdrop(0.01), await backdrop(0.5)],
  };
  for (const w of widths) {
    const s = sharp(square).resize(w, w, { kernel: 'lanczos3' });
    await s
      .clone()
      .avif({ quality: 55, effort: 7 })
      .toFile(join(OUT, `portrait-${w}.avif`));
    await s
      .clone()
      .webp({ quality: 80, effort: 6 })
      .toFile(join(OUT, `portrait-${w}.webp`));
    out.avif.push(`/media/portrait-${w}.avif ${w}w`);
    out.webp.push(`/media/portrait-${w}.webp ${w}w`);
  }
  out.src = `/media/portrait-${widths.includes(320) ? 320 : widths[0]}.webp`;
  writeFileSync(MANIFEST, JSON.stringify(out, null, 1) + '\n');
  // a smaller photo writes fewer widths: the larger ones from an earlier photo would ship unreferenced
  const written = new Set(widths.flatMap((w) => [`portrait-${w}.avif`, `portrait-${w}.webp`]));
  for (const f of portraitFiles().filter((f) => !written.has(f))) rmSync(join(OUT, f));
  console.log(`crop ${left},${top},${side} of ${width}×${height}; backdrop ${out.bg.join(' → ')}`);
  console.log(
    widths
      .map((w) => `${w}: ${(statSync(join(OUT, `portrait-${w}.avif`)).size / 1024).toFixed(1)} KB avif`)
      .join(' · '),
    '→',
    MANIFEST,
  );
  return 0;
}

try {
  process.exitCode = await main();
} catch (e) {
  console.error(`media:portrait: ${e?.message ?? e}`);
  process.exitCode = 1;
}
