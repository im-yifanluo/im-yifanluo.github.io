/**
 * Where the media scripts read and write. Every setting can be overridden from the environment; relative values are
 * resolved against the current directory (the repository root under `npm run`).
 *
 *   MEDIA_SRC    source footage and full-size images, one folder per job (default ../portfolio-media, next to the repo)
 *   MEDIA_CACHE  lossless masters and other intermediates (default $MEDIA_SRC/.cache)
 *   MEDIA_OUT    web-ready files (default public/media)
 *   OG_OUT       the link-preview image (default public/og.jpg, served at /og.jpg)
 *   FFMPEG, FFPROBE  the binaries to run (default: ffmpeg and ffprobe on PATH; ffmpeg needs libx264 and libsvtav1)
 *
 * The manifests are always written into the repository: src/generated/media.json and src/generated/portrait.json.
 */
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const env = (name) => process.env[name] || undefined;

export const REPO = fileURLToPath(new URL('../../', import.meta.url));
export const MEDIA_SRC = resolve(env('MEDIA_SRC') ?? join(REPO, '../portfolio-media'));
export const MEDIA_CACHE = resolve(env('MEDIA_CACHE') ?? join(MEDIA_SRC, '.cache'));
export const MEDIA_OUT = resolve(env('MEDIA_OUT') ?? join(REPO, 'public/media'));
export const OG_OUT = resolve(env('OG_OUT') ?? join(REPO, 'public/og.jpg'));
export const MANIFEST = join(REPO, 'src/generated/media.json');
export const PORTRAIT_MANIFEST = join(REPO, 'src/generated/portrait.json');
export const FFMPEG = env('FFMPEG') ?? 'ffmpeg';
export const FFPROBE = env('FFPROBE') ?? 'ffprobe';

/** One job's source folder, $MEDIA_SRC/<name>. */
export const source = (name) => join(MEDIA_SRC, name);
