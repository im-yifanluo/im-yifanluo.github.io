/**
 * memos media jobs, called from scripts/media/build.mjs (`jobs.memos`, `jobs['memos-hero']`), which passes in its
 * helpers. Sources ($MEDIA_SRC/memos): the team's real Cal Hacks 13 scenes rendered headless in the memos viewer.
 *
 * memos (tile)
 *   Tile: the plaza in front of the Palace of Fine Arts rotunda (scene o3328, one Ray-Ban Meta clip), the camera
 *   trucking ±0.9 m along the wearer's own walk while the clip plays, so people (point ghosts) cross the plaza.
 *   rotunda-tile.mp4 is 6.5 s: the camera repeats every 6 s, the last 0.5 s is dissolved onto the first, and only the
 *   walking ghosts cross-fade there (the camera is in the same place), so the 6.0 s loop is seamless. The poster is
 *   the loop's first frame.
 * memos-hero (project page)
 *   The same plaza, wider (56° instead of 44°, 1.2 m further back) on an 8 s truck (rotunda-hero.mp4, 8.5 s, the same
 *   0.5 s dissolve) → an 8.0 s loop, rotated to start at 3.0 s (people small in the plaza) so the poster is that frame.
 *   Its own entry, with its own 960 and 1280 loops, rebuilt alone with --only memos-hero.
 * Grade: the shared one (saturation 0.9). The real scenes have their own light, so there is no black lift.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { source } from '../paths.mjs';

const here = source('memos');
const need = (f) => { const p = join(here, f); if (!existsSync(p)) throw new Error(`${p}: missing from MEDIA_SRC`); return p; };
/** A seamless loop from a clip whose last `d` seconds continue into its first: dissolve them over the seam. */
const seam = (L, d, grade) => `[0]trim=${d}:${L},setpts=PTS-STARTPTS,fps=30,${grade}[x];[1]trim=0:${d},setpts=PTS-STARTPTS,fps=30,${grade}[y];[x][y]xfade=transition=fade:duration=${d}:offset=${(L - 2 * d).toFixed(3)}[out]`;

export async function memos({ master, loop, frame, posters, WORK, TILE_MAX, fmtGrade }) {
  const tileSrc = need('rotunda-tile.mp4');
  const m = master('memos', ['-i', tileSrc, '-i', tileSrc], seam(6.5, 0.5, fmtGrade), 1280);
  const png = frame(m, 0, join(WORK, 'memos-poster.png'));
  const tile = { poster: await posters('memos', png, [640, 960, 1280]), loops: [loop('memos', m, 640, TILE_MAX), loop('memos', m, 960, TILE_MAX * 1.6)] };
  return { tile };
}

export async function memosHero({ master, rotate, loop, frame, posters, WORK, TILE_MAX, HERO_MAX, fmtGrade }) {
  const src = need('rotunda-hero.mp4');
  const m0 = master('memos-hero', ['-i', src, '-i', src], seam(8.5, 0.5, fmtGrade), 1280);
  // Start (and pose) at 3.0 s: people small in the middle of the plaza, not the two close ghosts of 0–2 s.
  const m = rotate('memos-hero', m0, 3.0);
  const png = frame(m, 0, join(WORK, 'memos-hero-poster.png'));
  return { hero: { kind: 'loop', poster: await posters('memos-hero', png, [640, 960, 1280]), loops: [loop('memos-hero', m, 960, TILE_MAX * 1.6), loop('memos-hero', m, 1280, HERO_MAX)] } };
}
