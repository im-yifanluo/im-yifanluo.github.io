#!/usr/bin/env node
/**
 * The site's media: the project tiles at ONE size and ratio (16:9), the project heroes and the project-page figures,
 * written to public/media/ with a manifest at src/generated/media.json, and the link-preview image public/og.jpg.
 *
 *   npm run media                               every job, in the order below
 *   npm run media -- --only memos,memos-hero    only these jobs
 *   npm run media -- --help                     usage, the job names and the settings
 *
 * Contract: tiles and heroes 16:9, cropped to the subject (screen captures are set whole on the media plate); no labels
 * added to tiles; at most one mild grade (saturation 0.9, a white-balance pull toward neutral on lab photos); posters
 * (16:9) AVIF q50 + WebP q78 and stills (their own aspect ratio) AVIF q55 + WebP q80, at the widths each job lists
 * (tiles 640–1280, heroes and figures up to 1760), never above the source's own resolution; loops H.264 High (yuv420p,
 * +faststart, no audio) + AV1 (libsvtav1) in WebM, within the loop budgets in scripts/budgets.json, 3–8 s, seamless
 * (matched frames, a cross-faded seam or a boomerang). Every loop is first rendered to a lossless master, so the poster
 * is the master's frame, not a re-decoded lossy one.
 *
 * Sources are read from $MEDIA_SRC (one folder per job); intermediates go to $MEDIA_CACHE. Every setting is described
 * in scripts/media/paths.mjs. A job is a function in the `jobs` object below (inline, or imported from jobs/<job>.mjs)
 * that writes its files and returns its manifest entry, typed as MediaEntry in src/lib/media.ts (`tile`, `hero` and
 * `figure`, each a poster with optional loops and phone cut; `og` for the link preview). The helpers the jobs share
 * (ffmpeg, masters and loops, posters and stills, the plate) are in scripts/media/lib.mjs.
 * Exit codes: 0 done, 1 a job failed, 2 a usage error or a missing MEDIA_SRC.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { apriltagOverlay } from './jobs/apriltag-overlay.mjs';
import { framelight, framelightPrompts, framelightShots } from './jobs/framelight.mjs';
import { memos, memosHero } from './jobs/memos.mjs';
import { photogleam } from './jobs/photogleam.mjs';
import {
  OUT,
  WORK,
  TILE_MAX,
  TILE_HIDPI_MAX,
  ff,
  probe,
  bytes,
  master,
  loop,
  rotate,
  frame,
  posters,
  stills,
  neutralise,
  fmtGrade,
} from './lib.mjs';
import { MANIFEST, MEDIA_SRC, OG_OUT, source } from './paths.mjs';

const jobs = {};

// ── Framelight: the shipped app's landscape screen, whole, a still; the hero is the same minute as three screens (jobs/framelight.mjs) ──
jobs.framelight = framelight;
// Page figures (not 16:9, so `stills`): three live-view prompts and four photos shot with the app
jobs['framelight-prompts'] = framelightPrompts;
jobs['framelight-shots'] = framelightShots;

// ── Robot learning: the tile is the real wrist camera turning the knob (a policy I trained, after the fixes),
// boomeranged; the hero is the UR5e itself.
// The clip's first 0.28 s is the camera still descending onto a blank wall (the knob enters from the top edge), which a
// boomerang would play twice, ≈ 0.8 s of every loop. So the loop starts at 0.30 s, the first frame with the whole knob
// in view: 1.3 s each way, 2.6 s (a little under the 3 s floor: the source is 1.6 s, and slowing a robot clip would
// misstate its speed). The rotation keeps the poster on source time 1.2 s (0.9 s in). ──────────────────────────────────
const WRIST_IN = 0.3;
jobs['robot-learning'] = async () => {
  const m0 = master(
    'robot-learning-wrist',
    ['-i', join(source('robot-learning'), 'deploy-wrist-knob.mp4')],
    `[0]trim=start=${WRIST_IN},setpts=PTS-STARTPTS,fps=30,crop=640:360:0:60,${fmtGrade},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[out]`,
    640,
  );
  const m = rotate('robot-learning-wrist', m0, 1.2 - WRIST_IN);
  const png = frame(m, 0, join(WORK, 'robot-learning-poster.png'));
  const poster = await posters('robot-learning', png, [640]);
  const tile = { poster, loops: [loop('robot-learning', m, 640, TILE_MAX)] };
  // Hero: the UR5e setup photo, 16:9 crop 2400×1350 on the arm and table, white balance pulled toward the table's grey.
  const src = join(source('robot-learning'), 'robotouch_ur5_real_setup_apriltag_cube.jpg');
  const crop = { left: 0, top: 100, width: 2400, height: 1350 };
  const { gains } = await neutralise(src, { left: 1000, top: 1450, width: 600, height: 250 });
  const heroPng = join(WORK, 'robot-learning-hero.png');
  await sharp(src).rotate().extract(crop).linear(gains, [0, 0, 0]).modulate({ saturation: 0.9 }).png().toFile(heroPng);
  return { tile, hero: { kind: 'still', poster: await posters('robot-learning-hero', heroPng, [1280, 1760]) }, gains };
};

// ── AR overlay: the tool's own output, four YCB objects rendered on the lab table in front of the UR5e; the tile and
// the hero are crops of that real frame (jobs/apriltag-overlay.mjs). ────────────────────────────────────────────────────
jobs['apriltag-overlay'] = apriltagOverlay;

// The second YCB layout, a page figure: the source's first 5 columns are white (a capture margin), which would draw a
// 1.5 px sliver inside the figure's left hairline, so 6 px come off its left edge; text width, at 520, 780 and 1040 px
// (the source is 1345 × 990, never enlarged).
jobs['ar-overlay-ycb-2'] = async () => {
  const src = join(source('ar-overlay-ycb-2'), 'robotouch_object_rendering_overlay_ycb_2.jpg');
  const { width, height } = await sharp(src).metadata();
  const png = join(WORK, 'ar-overlay-ycb-2.png');
  await sharp(src)
    .extract({ left: 6, top: 0, width: width - 6, height })
    .png()
    .toFile(png);
  return { figure: { poster: await stills('ar-overlay-ycb-2', png, [520, 780, 1040]), loops: [] } };
};

// ── Long-document RAG has no job: its tile and hero are a labelled strip drawn in HTML/SVG at build time
// (src/components/OrderStrip.astro, which holds the positions and their source). ─────────────────────────────────────

// ── Project-page loop: one demonstration from the gripper's GoPro (fisheye), centre crop clear of the black corners ──
jobs['umi-demo'] = async () => {
  const src = join(source('umi-demo'), 'umi-grasp-cylinder-demo-gx010450.mp4');
  const dur = Number(probe(src).format.duration);
  const L = Math.min(7.6, dur),
    d = 0.25; // a short dissolve: the handheld view changes a lot between the clip's ends
  const pre = join(WORK, 'umi-pre.mkv');
  ff([
    '-i',
    src,
    '-vf',
    `trim=0:${L},setpts=PTS-STARTPTS,fps=30,crop=640:360:160:200,${fmtGrade},format=yuv444p`,
    '-an',
    '-c:v',
    'libx264',
    '-qp',
    '0',
    '-preset',
    'veryfast',
    pre,
  ]);
  const m0 = master(
    'umi-demo',
    ['-i', pre, '-i', pre],
    `[0]trim=${d}:${L},setpts=PTS-STARTPTS,fps=30[x];[1]trim=0:${d},setpts=PTS-STARTPTS,fps=30[y];[x][y]xfade=transition=fade:duration=${d}:offset=${(L - 2 * d).toFixed(3)}[out]`,
    640,
  );
  const m = rotate('umi-demo', m0, 3.0);
  const png = frame(m, 0, join(WORK, 'umi-demo-poster.png'));
  return { figure: { poster: await posters('umi-demo', png, [640]), loops: [loop('umi-demo', m, 640, TILE_MAX)] } };
};

// ── World Cup forecasting: charts drawn in the site's type in headless Chrome, rendered ahead of time to PNG frames and
// stills in $MEDIA_SRC/world-cup-forecasting/render. Tile: a 7.2 s line-draw loop that starts on its finished drawing
// (= the poster), no text. Hero and figures: labelled stills, each with a `phone` variant for viewports up to 719 px,
// which PosterBox.astro serves there.
const WC = join(source('world-cup-forecasting'), 'render');
const wcNeed = (f) => {
  if (!existsSync(join(WC, f))) throw new Error(`${f}: missing from ${WC}`);
  return join(WC, f);
};
jobs['world-cup-forecasting'] = async () => {
  const f0 = wcNeed('tile/f0000.png');
  const m = master(
    'world-cup-forecasting',
    ['-framerate', '30', '-i', join(WC, 'tile/f%04d.png')],
    '[0]format=yuv444p,setsar=1[out]',
    1280,
  );
  const poster = await posters('world-cup-forecasting', f0, [640, 960, 1280]);
  return {
    tile: {
      poster,
      loops: [loop('world-cup-forecasting', m, 640, TILE_MAX), loop('world-cup-forecasting', m, 960, TILE_HIDPI_MAX)],
    },
  };
};
// The hero is its own entry: labelled stills from their own renders, rebuilt alone (--only world-cup-forecasting-hero)
// without re-encoding the tile's loops.
jobs['world-cup-forecasting-hero'] = async () => ({
  hero: {
    kind: 'still',
    poster: await posters('world-cup-forecasting-hero', wcNeed('hero.png'), [1280, 1760]),
    phone: await stills('world-cup-forecasting-hero-phone', wcNeed('hero-phone.png'), [736, 1104]),
  },
});
for (const f of ['calibration', 'categories']) {
  jobs[`world-cup-forecasting-${f}`] = async () => ({
    figure: {
      poster: await posters(`world-cup-forecasting-${f}`, wcNeed(`${f}.png`), [880, 1320, 1760]),
      loops: [],
      phone: await stills(`world-cup-forecasting-${f}-phone`, wcNeed(`${f}-phone.png`), [736, 1104]),
    },
  });
}

// ── memos: the team's real Cal Hacks 13 scenes, rendered headless in the memos viewer (jobs/memos.mjs) ──────────────
// Tile: the Palace of Fine Arts rotunda (scene o3328), a 6.0 s truck along the wearer's walk with people crossing as
// point ghosts.
// Hero: the same plaza, wider, 8.0 s, as its own entry (memos-hero) with its own 960 and 1280 loops.
// These scenes have their own light, so they get only the shared grade.
jobs.memos = memos;
jobs['memos-hero'] = memosHero;

// ── PhotoGleam: the app's own screens set whole on the plate, each rendition composed at its own width
// (jobs/photogleam.mjs) ──────────────────────────────────────────────────────────────────────────────────────────────
jobs.photogleam = photogleam;

// ── Link preview (og:image, 1200×630): the Framelight hero's three real screens, cut from its 16:9 master to 1.905:1
// (only plate is cut; the screens fill 82 % of the master's height). Run after `framelight`, with the same MEDIA_CACHE.
// Written to OG_OUT (default public/og.jpg), which the site serves at /og.jpg. ─────────────────────────────────────────
jobs.og = async () => {
  const src = join(WORK, 'framelight-hero.png');
  if (!existsSync(src)) throw new Error('run --only framelight first (it writes framelight-hero.png to MEDIA_CACHE)');
  const { width, height } = await sharp(src).metadata();
  const h = Math.round((width * 630) / 1200);
  await sharp(src)
    .extract({ left: 0, top: Math.round((height - h) / 2), width, height: h })
    .resize(1200, 630, { kernel: 'lanczos3' })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(OG_OUT);
  return { og: { src: '/og.jpg', w: 1200, h: 630, bytes: bytes(OG_OUT) } };
};

// ── command line ─────────────────────────────────────────────────────────────────────────────────────────────────────
const usage = (names) => `usage: npm run media [-- --only <job>[,<job>…]]

Rebuilds the web media (MEDIA_OUT, OG_OUT) and src/generated/media.json from the sources in MEDIA_SRC.
  --only <jobs>  run only these jobs (comma-separated); they still run in the order below
  -h, --help     show this text

Jobs, in order: ${names.join(', ')}

Settings, from the environment (scripts/media/paths.mjs): MEDIA_SRC (now ${MEDIA_SRC}), MEDIA_CACHE, MEDIA_OUT,
OG_OUT, FFMPEG, FFPROBE.`;

/** The arguments → { help } | { only: job names or null } | { error }. */
function parseArgs(argv) {
  let only = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') return { help: true };
    if (a === '--only' || a.startsWith('--only=')) {
      const v = a === '--only' ? argv[++i] : a.slice('--only='.length);
      only = (v ?? '')
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      if (!v || v.startsWith('-') || only.length === 0)
        return { error: '--only needs a comma-separated list of job names' };
      continue;
    }
    return { error: `unknown argument: ${a}` };
  }
  return { only };
}

async function main() {
  const names = Object.keys(jobs);
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage(names));
    return 0;
  }
  if (args.error) {
    console.error(`media: ${args.error}\n\n${usage(names)}`);
    return 2;
  }
  const unknown = (args.only ?? []).filter((n) => !names.includes(n));
  if (unknown.length) {
    console.error(`media: no such job: ${unknown.join(', ')}\njobs: ${names.join(', ')}`);
    return 2;
  }
  const selected = names.filter((n) => !args.only || args.only.includes(n));
  // every job but og reads MEDIA_SRC (og cuts the Framelight hero from MEDIA_CACHE)
  if (selected.some((n) => n !== 'og') && !existsSync(MEDIA_SRC)) {
    console.error(
      `media: MEDIA_SRC not found: ${MEDIA_SRC}\nSet MEDIA_SRC to the media sources folder (one subfolder per job).`,
    );
    return 2;
  }
  mkdirSync(OUT, { recursive: true });
  mkdirSync(WORK, { recursive: true });

  const manifest = {};
  for (const name of selected) {
    const t0 = Date.now();
    manifest[name] = await jobs[name]();
    const l = [manifest[name].tile, manifest[name].hero, manifest[name].figure].flatMap((x) => x?.loops ?? []);
    console.log(
      `${name.padEnd(22)} ${((Date.now() - t0) / 1000).toFixed(1)} s  ` +
        l
          .map(
            (x) =>
              `${x.w}: ${(x.mp4Bytes / 1024).toFixed(0)} KB h264 crf${x.crf} / ${(x.webmBytes / 1024).toFixed(0)} KB av1, ${x.duration} s`,
          )
          .join(' · '),
    );
  }
  // Read the manifest just before writing and replace only the entries this run made, so a concurrent `--only` run
  // elsewhere is not undone.
  const latest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
  for (const name of selected) latest[name] = manifest[name];
  writeFileSync(MANIFEST, JSON.stringify(latest, null, 1) + '\n');
  console.log('wrote', MANIFEST);
  return 0;
}

try {
  process.exitCode = await main();
} catch (e) {
  const missing = e?.code === 'ENOENT' && String(e.syscall).startsWith('spawn');
  console.error(
    `media: ${missing ? `${e.path}: not found (set FFMPEG / FFPROBE, or put ffmpeg on PATH)` : (e?.message ?? e)}`,
  );
  process.exitCode = 1;
}
