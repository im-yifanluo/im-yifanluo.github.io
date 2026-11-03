// The media manifest (src/generated/media.json, written by `npm run media`): per entry, the renditions of a project's
// tile, hero and figures, and the link-preview image. Every file it names is in public/media (og.jpg at the site root).
import manifest from '@/generated/media.json';

/** One loop rendition: H.264 MP4 and AV1 WebM at one width. */
export interface Loop {
  w: number;
  h: number;
  mp4: string;
  webm: string;
  mp4Bytes: number;
  webmBytes: number;
  crf: number;
  crfAv1: number;
  duration: number;
  fps: string;
}

/** A poster set: AVIF and WebP `srcset` items, one per width. 16:9 unless `w` × `h` (a still's own size) is given. */
export interface Poster {
  widths: number[];
  avif: string[];
  webp: string[];
  src: string;
  w?: number;
  h?: number;
  bytes?: Record<string, { avif: number; webp: number }>;
}

/** A phone cut, shown below 720 px: its own size and aspect ratio. */
export interface PhonePoster extends Poster {
  w: number;
  h: number;
}

/** One part of an entry: its poster, an optional phone cut and its loops. */
export interface MediaPart {
  /** "still" or "loop", as the media script records it; the site goes by `loops`. */
  kind?: string;
  poster: Poster;
  phone?: PhonePoster;
  loops?: Loop[];
}

export type PartName = 'tile' | 'hero' | 'figure';

export interface MediaEntry {
  tile?: MediaPart;
  hero?: MediaPart;
  figure?: MediaPart;
  /** Per-channel (RGB) grey-balance gains the media script applied to the master. */
  gains?: number[];
  og?: { src: string; w: number; h: number; bytes: number };
}

export const MEDIA: Record<string, MediaEntry> = manifest;

/** Where a box's media comes from: one part of a manifest entry (`alt` for a hero or figure; a tile is decorative), or
 *  a drawing in HTML/SVG (components/OrderStrip.astro). */
export type MediaRef = { media: string; part: PartName; alt?: string } | { drawn: 'order-strip' };

/** The portrait manifest (src/generated/portrait.json, written by `npm run media:portrait`): AVIF and WebP `srcset`
 *  items, the fallback `src`, the largest width's size, the object-position and the photo's backdrop colours. */
export interface Portrait {
  avif: string[];
  webp: string[];
  src: string;
  w: number;
  h: number;
  position: string;
  bg?: [string, string];
}

/** The manifest part a reference names (undefined for a drawing or an unknown entry). */
export function mediaPart(ref: MediaRef): MediaPart | undefined {
  return 'media' in ref && Object.hasOwn(MEDIA, ref.media) ? MEDIA[ref.media]?.[ref.part] : undefined;
}
