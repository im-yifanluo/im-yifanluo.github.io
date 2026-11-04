/**
 * The helpers the media jobs share (scripts/media/build.mjs and jobs/<job>.mjs): ffmpeg and ffprobe, lossless masters
 * and the web loops cut from them, AVIF + WebP posters and stills, the shared grade, a lab photo's white balance, and
 * the plate that composed stills are set on. Web-ready files go to OUT ($MEDIA_OUT), intermediates to WORK
 * ($MEDIA_CACHE); see paths.mjs.
 */
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { FFMPEG, FFPROBE, MEDIA_CACHE, MEDIA_OUT } from './paths.mjs';

const OUT = MEDIA_OUT;
const WORK = MEDIA_CACHE;

const SURFACE = '#F6F6F4'; // the media plate: the grey every composed still is set on
const TILE_MAX = 400 * 1024; // the loop limits (scripts/budgets.json tileLoopBytes.max and heroLoopBytes.max)
const HERO_MAX = 1024 * 1024;

const ff = (args) =>
  execFileSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', ...args], {
    stdio: ['ignore', 'inherit', 'inherit'],
    maxBuffer: 1 << 28,
    env: { ...process.env, SVT_LOG: '1' },
  });
const probe = (file) =>
  JSON.parse(
    execFileSync(FFPROBE, [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,codec_name,width,height,r_frame_rate:format=duration',
      '-of',
      'json',
      file,
    ]).toString(),
  );
const bytes = (f) => statSync(f).size;
const h9 = (w) => Math.round((w * 9) / 16);

/** Lossless master (H.264 qp 0, yuv444p) from an ffmpeg input + filter graph ending in [out]. */
function master(name, inputs, graph, w) {
  const file = join(WORK, `${name}.master.mkv`);
  ff([
    ...inputs,
    '-filter_complex',
    `${graph};[out]scale=${w}:${h9(w)}:flags=lanczos,fps=30,format=yuv444p[m]`,
    '-map',
    '[m]',
    '-c:v',
    'libx264',
    '-qp',
    '0',
    '-preset',
    'veryfast',
    '-an',
    file,
  ]);
  return file;
}

/** H.264 + AV1 loop at width w from a master; raises CRF until the H.264 file fits `max`. */
function loop(name, masterFile, w, max) {
  const vf = `scale=${w}:${h9(w)}:flags=lanczos,format=yuv420p`;
  const mp4 = join(OUT, `${name}-${w}.mp4`);
  const webm = join(OUT, `${name}-${w}.webm`);
  let crf = w >= 1280 ? 24 : 25;
  for (;;) {
    ff([
      '-i',
      masterFile,
      '-vf',
      vf,
      '-c:v',
      'libx264',
      '-profile:v',
      'high',
      '-preset',
      'slow',
      '-crf',
      String(crf),
      '-g',
      '60',
      '-movflags',
      '+faststart',
      '-an',
      '-map_metadata',
      '-1',
      '-metadata:s:v',
      'handler_name=',
      mp4,
    ]);
    if (bytes(mp4) <= max || crf >= 30) break;
    crf += 1;
  }
  let crfAv1 = 35;
  for (;;) {
    // bitexact: the WebM muxer otherwise writes a random track UID, so a rerun would rewrite an unchanged loop
    ff([
      '-i',
      masterFile,
      '-vf',
      vf,
      '-c:v',
      'libsvtav1',
      '-preset',
      '6',
      '-crf',
      String(crfAv1),
      '-g',
      '60',
      '-an',
      '-map_metadata',
      '-1',
      '-fflags',
      '+bitexact',
      webm,
    ]);
    if (bytes(webm) <= Math.min(max, bytes(mp4)) || crfAv1 >= 42) break;
    crfAv1 += 1;
  }
  const p = probe(mp4);
  const v = p.streams.find((s) => s.codec_type === 'video');
  if (p.streams.some((s) => s.codec_type === 'audio')) throw new Error(`${mp4}: has an audio stream`);
  return {
    w,
    h: h9(w),
    mp4: `/media/${name}-${w}.mp4`,
    webm: `/media/${name}-${w}.webm`,
    mp4Bytes: bytes(mp4),
    webmBytes: bytes(webm),
    crf,
    crfAv1,
    duration: Number(Number(p.format.duration).toFixed(2)),
    fps: v.r_frame_rate,
  };
}

/** Rotate a seamless master so it starts at t (lossless). The poster is then the loop's own first frame, so the poster →
 *  loop dissolve shows one image, never two poses; the poster keeps the moment chosen for it. */
function rotate(name, masterFile, t) {
  const file = join(WORK, `${name}.rot.mkv`);
  ff([
    '-i',
    masterFile,
    '-filter_complex',
    `[0]split[a][b];[a]trim=start=${t},setpts=PTS-STARTPTS[x];[b]trim=end=${t},setpts=PTS-STARTPTS[y];[x][y]concat=n=2:v=1[m]`,
    '-map',
    '[m]',
    '-c:v',
    'libx264',
    '-qp',
    '0',
    '-preset',
    'veryfast',
    '-an',
    file,
  ]);
  return file;
}

/** Frame at time t of a master as a PNG. */
function frame(masterFile, t, png) {
  ff(['-ss', String(t), '-i', masterFile, '-frames:v', '1', '-pix_fmt', 'rgb24', png]);
  return png;
}

/** AVIF + WebP posters at each width ≤ the master's width, all exactly 16:9 (cover-cropped, centred). */
async function posters(name, png, widths) {
  const meta = await sharp(png).metadata();
  const ws = widths.filter((w) => w <= meta.width);
  const out = { widths: ws, avif: [], webp: [] };
  for (const w of ws) {
    const img = sharp(png).resize(w, h9(w), { fit: 'cover', kernel: 'lanczos3' });
    await img
      .clone()
      .avif({ quality: 50, effort: 7 })
      .toFile(join(OUT, `${name}-${w}.avif`));
    await img
      .clone()
      .webp({ quality: 78, effort: 6 })
      .toFile(join(OUT, `${name}-${w}.webp`));
    out.avif.push(`/media/${name}-${w}.avif ${w}w`);
    out.webp.push(`/media/${name}-${w}.webp ${w}w`);
  }
  out.src = `/media/${name}-${ws[0]}.webp`;
  out.bytes = Object.fromEntries(
    ws.map((w) => [w, { avif: bytes(join(OUT, `${name}-${w}.avif`)), webp: bytes(join(OUT, `${name}-${w}.webp`)) }]),
  );
  return out;
}

/** Still image (not 16:9): AVIF + WebP at widths ≤ source, native aspect ratio. */
async function stills(name, png, widths) {
  const meta = await sharp(png).metadata();
  const ws = widths.filter((w) => w <= meta.width);
  const out = { widths: ws, avif: [], webp: [], w: meta.width, h: meta.height };
  for (const w of ws) {
    const img = sharp(png).resize(w, null, { kernel: 'lanczos3' });
    await img
      .clone()
      .avif({ quality: 55, effort: 7 })
      .toFile(join(OUT, `${name}-${w}.avif`));
    await img
      .clone()
      .webp({ quality: 80, effort: 6 })
      .toFile(join(OUT, `${name}-${w}.webp`));
    out.avif.push(`/media/${name}-${w}.avif ${w}w`);
    out.webp.push(`/media/${name}-${w}.webp ${w}w`);
  }
  out.src = `/media/${name}-${ws[0]}.webp`;
  return out;
}

/** Pull a lab photo's neutral surface toward grey: scale channels by `amount` of the cast. */
async function neutralise(input, patch, amount = 0.7) {
  const { data, info } = await sharp(input).extract(patch).raw().toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += info.channels) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
  const n = data.length / info.channels;
  const mean = sum.map((s) => s / n);
  const grey = (mean[0] + mean[1] + mean[2]) / 3;
  const gains = mean.map((m) => 1 + amount * (grey / m - 1));
  return { gains, mean };
}

const fmtGrade = 'eq=saturation=0.9';

/** An image (a sharp pipeline, already w×h) with r px rounded corners, transparent outside, and any `over` layers on
 *  top, as PNG bytes. */
function roundCorners(img, w, h, r, over = []) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`,
  );
  return img
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }, ...over])
    .png()
    .toBuffer();
}

/** The plate, w×h, with the given layers composited (each { input, left, top }), as a PNG pipeline. */
const plate = (w, h, layers) =>
  sharp({ create: { width: w, height: h, channels: 3, background: SURFACE } })
    .composite(layers)
    .png();

export {
  OUT,
  WORK,
  TILE_MAX,
  HERO_MAX,
  ff,
  probe,
  bytes,
  h9,
  master,
  loop,
  rotate,
  frame,
  posters,
  stills,
  neutralise,
  fmtGrade,
  roundCorners,
  plate,
};
