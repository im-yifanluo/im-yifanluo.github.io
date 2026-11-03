#!/usr/bin/env node
// Privacy gate for the built site and the tracked sources. It reports personal data that must never ship:
//   emails       any address other than the site's public one, also obfuscated ("[at]", "[dot]", spelled out)
//   phones       North-American numbers in any common formatting, tel:/sms: links
//   addresses    street, apartment / unit, state + ZIP, PO box
//   secrets      API keys and tokens, private-key blocks, JWTs, hard-coded key assignments, dotenv file names
//   identifiers  private-range IPv4 addresses, camera serials and raw GoPro folder names, wandb links and host names,
//                Google Drive / Docs share links
//   metadata     EXIF (GPS in any IFD, maker notes, serial numbers), XMP (GPS and location fields), IPTC and PNG
//                comments in images; PDF text, links and metadata; video container tags and location atoms
// plus private rules and known private values loaded at run time (see "Private data" below).
//
// Every text is normalized before matching (NFKC, HTML entities, percent-encoding, JS/JSON escapes, dash and space
// variants, zero-width characters), so an encoded "@" or full-width digits do not slip through. In JS/CSS/source maps,
// the address rules run on string literals (where a bundle carries page text) rather than on the raw code. Binary
// files without a dedicated reader are scanned as ASCII strings, with the high-precision rules only.
//
// Files are read by their content, not their name: the first bytes pick the reader (JPEG, PNG, GIF, WebP, TIFF,
// AVIF/HEIF, MP4/MOV, WebM/MKV, PDF), so a renamed image still gets its metadata checked. A file whose content
// contradicts its extension is also reported as unscannable.
//
// Video tags come from ffprobe (FFPROBE, else ffprobe on PATH). Without ffprobe, the scan warns and reads the raw
// bytes instead (location atoms and ISO 6709 coordinates still fail); with CI or PRIVACY_STRICT=1 set, or with
// --strict, every video is unscannable instead. A video that ffprobe cannot read is always unscannable.
//
// Usage: node scripts/privacy-scan.mjs [--strict] [--quiet] [--json <report.json>] <dir|file>...
//   --strict   warnings fail as well, and so do missing private data, rejected private values and a missing ffprobe
//   exit 0 = clean (warnings allowed), 1 = findings at error level (or any warning with --strict),
//        2 = usage error, a file that could not be scanned, or private data missing or malformed where it is required
//
// Private data (kept outside the repository, mode 600):
//   Rules: PRIVACY_SCAN_RULES (a JSON string), else the file PRIVACY_SCAN_RULES_FILE
//          (default ~/.config/portfolio-website/privacy-rules.json):
//     { "rules":  [{ "id", "severity": "error" | "warn", "desc", "re", "flags", "context"?, "contextFlags"?,
//                    "where"?: "prose", "binary"?: true }],
//       "ignore": [ entries shaped like the allow file's ] }
//     Rules are compiled as regular expressions only, never executed as code. "context" must match within 60
//     characters of a hit; "where": "prose" skips raw code (its string literals are still scanned); "binary": true
//     also runs the rule on strings extracted from binary files.
//   Values: PRIVACY_SCAN_PRIVATE (entries separated by newlines or commas), else the file PRIVACY_SCAN_PRIVATE_FILE
//          (default ~/.config/portfolio-website/privacy-private-values.txt; one entry per line, and a line is also
//          split before a comma that starts another typed entry). Each entry is one of "phone:<any format>",
//          "email:<address>", "literal:<text>" (untyped = literal); "#" starts a comment. Known values are matched in
//          any spelling or encoding. An email must be a plain address, a phone 7 to 15 digits, a literal 4 characters
//          or more; other entries are rejected and reported by position, never by value. The values count as
//          configured once they hold at least one phone.
//   If either is missing, or a value is rejected, the scan warns and continues; with CI or PRIVACY_STRICT=1 set, or
//   with --strict, it exits 2. With CI set, findings of private rules are reported by number rather than by name.
//
// Exceptions: scripts/privacy-allow.json, each entry with a reason:
//   { "emails": ["<address>"], "ignore": [{ "rule": "<id>", "file": "<glob>", "match": "<regex>", "reason": "..." }] }
import { execFile as execFileCb } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { open, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';

const execFile = promisify(execFileCb);

export const SITE_EMAIL = 'yifan65@illinois.edu';
const ALLOW_FILE = fileURLToPath(new URL('./privacy-allow.json', import.meta.url));
const CONFIG_DIR = path.join(os.homedir(), '.config', 'portfolio-website');

const TEXT_EXT = new Set([
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.json',
  '.webmanifest',
  '.css',
  '.map',
  '.svg',
  '.md',
  '.txt',
  '.csv',
  '.tsv',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.ics',
  '.vcf',
  '.astro',
  '',
]);
const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.css', '.map']);
// The binary format each extension promises; the content decides which reader runs (see sniff()). ".ico" promises
// nothing, since browsers also accept a PNG under that name.
const EXT_FORMAT = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.jpe': 'jpeg',
  '.jfif': 'jpeg',
  '.jfi': 'jpeg',
  '.png': 'png',
  '.apng': 'png',
  '.gif': 'gif',
  '.webp': 'webp',
  '.tif': 'tiff',
  '.tiff': 'tiff',
  '.avif': 'heif',
  '.heic': 'heif',
  '.heif': 'heif',
  '.bmp': 'bmp',
  '.mp4': 'mp4',
  '.m4v': 'mp4',
  '.mov': 'mp4',
  '.webm': 'ebml',
  '.mkv': 'ebml',
  '.pdf': 'pdf',
  '.woff2': 'woff2',
  '.woff': 'woff',
  '.ttf': 'sfnt',
  '.otf': 'sfnt',
  '.zip': 'zip',
  '.gz': 'gzip',
  '.wasm': 'wasm',
};
const FORMAT_READER = {
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  tiff: 'image',
  heif: 'image',
  mp4: 'video',
  ebml: 'video',
  pdf: 'pdf',
  bmp: 'strings',
  ico: 'strings',
  woff2: 'strings',
  woff: 'strings',
  sfnt: 'strings',
  zip: 'strings',
  gzip: 'strings',
  wasm: 'strings',
};
// ISO-BMFF major brands of still images (AVIF, HEIF); any other "ftyp" brand is a video
const IMAGE_BRANDS = new Set([
  'avif',
  'avis',
  'avci',
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevx',
  'mif1',
  'mif2',
  'msf1',
]);
// "name@2x.png", "pkg@1.2.js": file names, not addresses
const FILE_TLDS =
  /^(png|jpe?g|gif|webp|avif|svg|ico|js|mjs|cjs|css|map|json|wasm|mp4|webm|mov|woff2?|ttf|otf|glb|gltf|bin|ts|tsx|html?|md|txt|splat|ply|pdf|zip)$/i;

// ───────────────────────────── generic rules ─────────────────────────────
// A rule is { id, severity, desc, re, filter?(match, text, index), context?, where?: 'prose', binary?: true } or, for
// matching done in code, { id, severity, desc, find(text, cfg) → [index, length, extra?][] }.
//   context  must match within ±60 characters of the hit
//   where    'prose': skipped on raw code (JS/CSS/maps); run on their string literals instead
//   binary   also run on ASCII strings extracted from binary files (high precision only)
const PHONE_SEP = '(?:\\s*[.\\-/·•|]\\s*|\\s+)';
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = new RegExp(`(?<![\\w.])${OCTET}\\.${OCTET}\\.${OCTET}\\.${OCTET}(?![\\w.]*\\d)(?!\\.\\w)`, 'g');
const PRIVATE_V4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.)/;
const digitsOf = (s) => s.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

/** Skip runs of numbers (SVG paths, CSV rows) and digit patterns that cannot be a dialable number. */
function isPhoneNumber(m, text, idx) {
  const before = text.slice(Math.max(0, idx - 3), idx);
  const after = text.slice(idx + m.length, idx + m.length + 3);
  if (/\d[ ,]?$/.test(before) || /^[ ,]?\d/.test(after)) return false;
  const d = digitsOf(m);
  return !/^(\d)\1+$/.test(d) && /^[2-9]\d{2}[2-9]\d{6}$/.test(d);
}

const PATTERN_RULES = [
  // Phones
  {
    id: 'phone.nanp',
    severity: 'error',
    desc: 'North-American phone number',
    filter: isPhoneNumber,
    re: new RegExp(
      `(?<![\\w.$#/-])(?:\\+?1${PHONE_SEP}?)?(?:\\(\\d{3}\\)\\s?|\\d{3}${PHONE_SEP})\\d{3}${PHONE_SEP}\\d{4}(?![\\w.-]*\\d)`,
      'g',
    ),
  },
  {
    id: 'phone.tel-link',
    severity: 'error',
    desc: 'tel:/sms: link',
    re: /\b(?:tel|sms|callto):\+?[\d().\s-]{7,}/gi,
    binary: true,
  },

  // Addresses
  {
    id: 'address.street',
    severity: 'error',
    desc: 'street address',
    where: 'prose',
    re: /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?(?:[A-Z][a-z]+\.?\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Terrace|Ter|Circle|Cir|Parkway|Pkwy|Highway|Hwy|Way)\b\.?(?:,?\s+(?:Apt|Apartment|Unit|Suite|Ste|#)\.?\s*#?\s*[\w-]+)?/g,
  },
  {
    id: 'address.unit',
    severity: 'error',
    desc: 'apartment / unit number',
    where: 'prose',
    re: /\b(?:Apt|Apartment)\.?\s*#?\s*\d+[A-Z]?\b/g,
  },
  {
    id: 'address.zip',
    severity: 'error',
    desc: 'state + ZIP code',
    where: 'prose',
    re: /\b(?:CA|FL|GA|IL|IN|MA|MI|NJ|NY|OH|PA|TX|WA|WI)\s+\d{5}(?:-\d{4})?\b/g,
  },
  { id: 'address.po-box', severity: 'error', desc: 'PO box', where: 'prose', re: /\bP\.?\s?O\.?\s+Box\s+\d+/gi },

  // Secrets
  { id: 'secret.google', severity: 'error', desc: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, binary: true },
  { id: 'secret.sk-key', severity: 'error', desc: 'sk- API key', re: /\bsk-[A-Za-z0-9_-]{20,}/g, binary: true },
  {
    id: 'secret.github',
    severity: 'error',
    desc: 'GitHub token',
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g,
    binary: true,
  },
  { id: 'secret.aws', severity: 'error', desc: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, binary: true },
  { id: 'secret.slack', severity: 'error', desc: 'Slack token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, binary: true },
  {
    id: 'secret.stripe',
    severity: 'error',
    desc: 'Stripe live key',
    re: /\b[rs]k_live_[0-9A-Za-z]{20,}/g,
    binary: true,
  },
  { id: 'secret.huggingface', severity: 'error', desc: 'Hugging Face token', re: /\bhf_[A-Za-z]{34}\b/g, binary: true },
  { id: 'secret.npm', severity: 'error', desc: 'npm token', re: /\bnpm_[A-Za-z0-9]{36}\b/g, binary: true },
  {
    id: 'secret.google-oauth',
    severity: 'error',
    desc: 'Google OAuth token',
    re: /\bya29\.[0-9A-Za-z_-]{20,}/g,
    binary: true,
  },
  {
    id: 'secret.private-key',
    severity: 'error',
    desc: 'private key block',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
    binary: true,
  },
  {
    id: 'secret.jwt',
    severity: 'warn',
    desc: 'JWT',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    id: 'secret.assignment',
    severity: 'warn',
    desc: 'hard-coded key assignment',
    re: /\b(?:api[_-]?key|secret|access[_-]?token|auth[_-]?token)["']?\s*[:=]\s*["'][A-Za-z0-9_-]{20,}["']/gi,
  },
  // "x?.env" is optional chaining in minified code, not a file name. Spelled e[n]v so this file does not match itself.
  {
    id: 'secret.env-file',
    severity: 'warn',
    desc: 'dotenv file name (credentials file)',
    re: /(?<![\w/.?-])\.e[n]v(?:\.(?:local|production|development|prod|dev|test))?(?![\w.-])/g,
  },

  // Identifiers
  {
    id: 'ip.private',
    severity: 'error',
    desc: 'private-range IPv4 address (robot, gripper or lab machine)',
    re: IPV4,
    filter: (m) => PRIVATE_V4.test(m),
  },
  {
    id: 'ip.public',
    severity: 'warn',
    desc: 'IPv4 address',
    re: IPV4,
    // loopback, broadcast and version-like runs (right after "v" or "version") are not addresses
    filter: (m, text, i) =>
      !PRIVATE_V4.test(m) &&
      !/^(?:0\.0\.0\.0|127\.|255\.255\.255\.255)/.test(m) &&
      !/(?:v|version\s?)$/i.test(text.slice(Math.max(0, i - 8), i)),
  },
  { id: 'gopro.serial', severity: 'error', desc: 'GoPro camera serial', re: /(?<![\w.])C\d{13}(?!\w)/g, binary: true },
  {
    id: 'gopro.demo-folder',
    severity: 'error',
    desc: 'raw GoPro demo folder name (carries the camera serial)',
    binary: true,
    re: /\b(?:demo|gripper_calibration|mapping)_[A-Z]\d{13}_\d{4}\.\d{2}\.\d{2}_\d{2}\.\d{2}\.\d{2}(?:\.\d+)?\b/g,
  },
  {
    id: 'wandb.url',
    severity: 'error',
    desc: 'Weights & Biases run or entity URL',
    re: /\bwandb\.ai\/[\w.-]+(?:\/[\w.-]+)*/gi,
    binary: true,
  },
  {
    id: 'wandb.host',
    severity: 'error',
    desc: 'machine host name recorded by wandb',
    re: /["']?\b(?:host|hostname)["']?\s*[:=]\s*["'][\w.-]{2,}["']/gi,
    context: /wandb|_wandb|run_id|wandb_version/i,
  },
  {
    id: 'drive.share-id',
    severity: 'error',
    desc: 'Google Drive / Docs share link (private file ID)',
    binary: true,
    re: /\b(?:drive|docs)\.google\.com\/(?:[\w-]+\/)*(?:d\/|open\?id=|uc\?(?:[\w=&-]*&)?id=)[\w-]{20,}/gi,
  },
];

// Emails and known values: matched in code rather than by one regex.
const EMAIL_RE =
  /(?<![\w.%+-])[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9-]{1,63})*\.([A-Za-z]{2,24})\b/g;
const OBF_TLD = '(?:com|edu|org|net|io|ai|dev|co|us|uk|ca|cn|me|app)';
const B_AT = String.raw`\s*[\[({<]\s*(?:at|@)\s*[\])}>]\s*`;
const B_DOT = String.raw`\s*(?:[\[({<]\s*(?:dot|\.)\s*[\])}>]|\s+dot\s+|\.)\s*`;
// a bracketed "at", with bracketed or plain dots …
const OBF_BRACKETED = new RegExp(
  String.raw`(?<![\w.+-])[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}${B_AT}[A-Za-z0-9-]{1,63}(?:${B_DOT}[A-Za-z0-9-]{1,63})*?${B_DOT}${OBF_TLD}\b`,
  'gi',
);
// … or "at" and "dot" both spelled out, so "worked at company.ai" is not a hit
const OBF_SPELLED = new RegExp(
  String.raw`(?<![\w.+-])[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}\s+at\s+[A-Za-z0-9-]{1,63}(?:\s+dot\s+[A-Za-z0-9-]{1,63})*?\s+dot\s+${OBF_TLD}\b`,
  'gi',
);
const deobfuscate = (s) =>
  s
    .replace(/\s*[\[({<]\s*(?:at|@)\s*[\])}>]\s*|\s+at\s+/i, '@')
    .replace(/\s*[\[({<]\s*(?:dot|\.)\s*[\])}>]\s*|\s+dot\s+/gi, '.')
    .replace(/\s+/g, '')
    .toLowerCase();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function findEmails(text, cfg) {
  const out = [];
  for (const m of text.matchAll(EMAIL_RE)) {
    const email = m[0].toLowerCase();
    if (FILE_TLDS.test(m[1]) || /^\d+x@/.test(email) || /@\d+x\./.test(email) || cfg.allowEmails.has(email)) continue;
    out.push([m.index, m[0].length]);
  }
  return out;
}

function findObfuscatedEmails(text, cfg) {
  const out = [];
  for (const re of [OBF_BRACKETED, OBF_SPELLED]) {
    for (const m of text.matchAll(re)) if (!cfg.allowEmails.has(deobfuscate(m[0]))) out.push([m.index, m[0].length]);
  }
  return out;
}

/** A known number spread over at most 32 characters, whatever separates its digits; or its 7-digit local part. */
function findKnownPhones(text, cfg) {
  if (!cfg.values.phones.length) return [];
  const out = [];
  const pos = [];
  let digits = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      digits += text[i];
      pos.push(i);
    }
  }
  for (const p of cfg.values.phones) {
    const full = [];
    for (let k = digits.indexOf(p); k !== -1; k = digits.indexOf(p, k + 1)) {
      const a = pos[k],
        b = pos[k + p.length - 1] + 1;
      if (b - a <= 32) {
        full.push([a, b]);
        out.push([a, b - a]);
      }
    }
    if (p.length !== 10) continue;
    const local = p.slice(3);
    const re = new RegExp(`(?<!\\d)${local.slice(0, 3)}${PHONE_SEP}${local.slice(3)}(?!\\d)`, 'g');
    for (const m of text.matchAll(re)) {
      if (full.some(([a, b]) => m.index < b && m.index + m[0].length > a)) continue;
      out.push([m.index, m[0].length, { partial: true }]);
    }
  }
  return out;
}

/** A known address with "@"/"." spelled, bracketed or spaced in any way. */
function findKnownEmails(text, cfg) {
  const out = [];
  for (const e of cfg.values.emails) {
    const [local, domain] = e.split('@');
    const re = new RegExp(
      `${escRe(local)}\\s*(?:@|[\\[({<]?\\s*at\\s*[\\])}>]?)\\s*${domain.split('.').map(escRe).join('\\s*(?:\\.|[\\[({<]?\\s*dot\\s*[\\])}>]?)\\s*')}`,
      'gi',
    );
    for (const m of text.matchAll(re)) out.push([m.index, m[0].length]);
  }
  return out;
}

/** A known literal, case-insensitive, any whitespace run matching any whitespace run. */
function findLiterals(text, cfg) {
  const out = [];
  for (const v of cfg.values.literals) {
    const re = new RegExp(v.trim().split(/\s+/).map(escRe).join('\\s+'), 'gi');
    for (const m of text.matchAll(re)) out.push([m.index, m[0].length]);
  }
  return out;
}

const FIND_RULES = [
  { id: 'email', severity: 'error', desc: 'email address that is not allowed', find: findEmails, binary: true },
  { id: 'email.obfuscated', severity: 'error', desc: 'obfuscated email address', find: findObfuscatedEmails },
  {
    id: 'phone.known',
    severity: 'error',
    desc: 'a known private phone number, in any formatting',
    find: findKnownPhones,
    binary: true,
  },
  {
    id: 'email.known',
    severity: 'error',
    desc: 'a known private email, in any spelling',
    find: findKnownEmails,
    binary: true,
  },
  { id: 'private.literal', severity: 'error', desc: 'a known private value', find: findLiterals, binary: true },
];

export const GENERIC_RULES = [...PATTERN_RULES, ...FIND_RULES];

// ───────────────────────────── private data and exceptions ─────────────────────────────
const isSet = (v) => !!v && !/^(?:0|false|no|off)$/i.test(v);

/** Inline env value, else the file (env override or default path); null when neither exists. */
function readPrivate(envVar, fileVar, defaultName) {
  if (process.env[envVar]?.trim()) return { text: process.env[envVar], from: envVar };
  const file = process.env[fileVar] || path.join(CONFIG_DIR, defaultName);
  return existsSync(file) ? { text: readFileSync(file, 'utf8'), from: file } : null;
}

/**
 * Entries of a private values source, each with its position for messages. Entries are one per line; with `commas`
 * (the environment variable) every comma separates entries too, otherwise only a comma that starts another typed
 * entry does, so a literal may contain commas.
 */
export function splitPrivateEntries(text, { commas = false, from = 'values' } = {}) {
  const out = [];
  String(text)
    .split(/\r?\n/)
    .forEach((line, i) => {
      const parts = /^\s*#/.test(line)
        ? [line]
        : commas
          ? line.split(',')
          : line.split(/,(?=\s*(?:phone|email|literal)\s*:)/i);
      parts.forEach((value, k) =>
        out.push({ value, where: `${from} line ${i + 1}${parts.length > 1 ? ` entry ${k + 1}` : ''}` }),
      );
    });
  return out;
}

const PLAIN_EMAIL =
  /^[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;
const PHONE_CHARS = /^[+\d\s().\-/]+$/;

/**
 * "phone:…", "email:…", "literal:…" (or untyped) entries, as strings or { value, where }. Phones are reduced to their
 * national digits. Entries that cannot be what their type says land in `rejected` ({ where, reason }, never the value).
 */
export function parsePrivateValues(entries) {
  const out = { phones: new Set(), emails: new Set(), literals: new Set() };
  const rejected = [];
  let n = 0;
  for (const entry of entries) {
    n++;
    const { value: raw, where = `entry ${n}` } = typeof entry === 'string' ? { value: entry } : entry;
    const v = String(raw).trim();
    if (!v || v.startsWith('#')) continue;
    const m = /^(phone|email|literal)\s*:\s*(.*)$/i.exec(v);
    const type = m ? m[1].toLowerCase() : 'literal';
    const value = (m ? m[2] : v).trim();
    const reject = (reason) => rejected.push({ where, reason: `${type}: ${reason}` });
    if (type === 'phone') {
      const d = digitsOf(value);
      if (!PHONE_CHARS.test(value) || d.length < 7 || d.length > 15)
        reject('needs 7 to 15 digits and only phone punctuation');
      else out.phones.add(d);
    } else if (type === 'email') {
      if (!PLAIN_EMAIL.test(value)) reject('not a plain email address');
      else out.emails.add(value.toLowerCase());
    } else if (value.length < 4) reject('shorter than 4 characters');
    else out.literals.add(value);
  }
  return { phones: [...out.phones], emails: [...out.emails], literals: [...out.literals], rejected };
}

const regexFlags = (flags, { global }) => {
  if (!/^[dgimsuvy]*$/.test(flags)) throw new Error(`bad regex flags "${flags}"`);
  const base = flags.replace(/[gy]/g, '');
  return global ? `${base}g` : base;
};

/**
 * Private rules JSON → compiled rules plus ignore entries. With `anonymize`, ids become "private.<n>". Error messages
 * never quote the input (JSON and RegExp errors would), so a malformed secret does not end up in a build log.
 */
export function compilePrivateRules(json, { anonymize = false } = {}) {
  let spec = json;
  if (typeof json === 'string') {
    try {
      spec = JSON.parse(json);
    } catch {
      throw new Error('private rules: not valid JSON');
    }
  }
  if (!spec || !Array.isArray(spec.rules))
    throw new Error('private rules: expected { "rules": [...], "ignore": [...] }');
  const generic = new Set(GENERIC_RULES.map((r) => r.id));
  const renamed = new Map();
  const rules = spec.rules.map((r, i) => {
    const where = `private rule #${i + 1}`;
    if (typeof r?.id !== 'string' || typeof r.re !== 'string')
      throw new Error(`${where}: "id" and "re" must be strings`);
    if (generic.has(r.id) || renamed.has(r.id)) throw new Error(`${where}: duplicate id`);
    if (!['error', 'warn'].includes(r.severity ?? 'error'))
      throw new Error(`${where}: severity must be "error" or "warn"`);
    if (r.where !== undefined && r.where !== 'prose') throw new Error(`${where}: "where" must be "prose" when set`);
    const id = anonymize ? `private.${i + 1}` : r.id;
    renamed.set(r.id, id);
    try {
      return {
        id,
        severity: r.severity ?? 'error',
        desc: anonymize ? 'private rule' : r.desc || r.id,
        re: new RegExp(r.re, regexFlags(r.flags ?? '', { global: true })),
        context: r.context ? new RegExp(r.context, regexFlags(r.contextFlags ?? '', { global: false })) : undefined,
        where: r.where,
        binary: r.binary === true,
      };
    } catch (e) {
      throw new Error(
        `${where}: invalid regular expression or flags (${/: ([^:/]+)$/.exec(e.message)?.[1] ?? 'syntax'})`,
      );
    }
  });
  const ignore = (spec.ignore ?? []).map((e) => ({ ...e, rule: renamed.get(e.rule) ?? e.rule }));
  return { rules, ignore };
}

function globToRe(glob) {
  const s = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/?/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '(?:.*/)?');
  return new RegExp(`^${s}$`);
}

function compileIgnore(e, from) {
  if (!e || (!e.rule && !e.file) || typeof e.reason !== 'string' || !e.reason.trim()) {
    throw new Error(`${from}: every ignore entry needs "rule" or "file", and a "reason"`);
  }
  let matchRe = null;
  try {
    matchRe = e.match ? new RegExp(e.match) : null;
  } catch {
    throw new Error(`${from}: invalid "match" regex in an ignore entry`);
  }
  return { ...e, fileRe: e.file ? globToRe(e.file) : null, matchRe };
}

/**
 * Everything a scan needs: rules (generic + private), known values, allowed emails, ignore entries, which private
 * inputs are missing or rejected, and whether the environment asks for a strict scan (CI, PRIVACY_STRICT). Throws on
 * malformed private rules or allow file.
 */
export function loadConfig() {
  const allow = existsSync(ALLOW_FILE) ? JSON.parse(readFileSync(ALLOW_FILE, 'utf8')) : {};
  const missing = [];

  const rulesSrc = readPrivate('PRIVACY_SCAN_RULES', 'PRIVACY_SCAN_RULES_FILE', 'privacy-rules.json');
  let priv = { rules: [], ignore: [] };
  if (rulesSrc) {
    try {
      priv = compilePrivateRules(rulesSrc.text, { anonymize: isSet(process.env.CI) });
    } catch (e) {
      throw new Error(`${rulesSrc.from}: ${e.message}`);
    }
  }
  if (!priv.rules.length) missing.push('private rules (PRIVACY_SCAN_RULES / PRIVACY_SCAN_RULES_FILE)');

  const valuesSrc = readPrivate('PRIVACY_SCAN_PRIVATE', 'PRIVACY_SCAN_PRIVATE_FILE', 'privacy-private-values.txt');
  const fromEnv = valuesSrc?.from === 'PRIVACY_SCAN_PRIVATE';
  const { rejected, ...values } = parsePrivateValues(
    valuesSrc ? splitPrivateEntries(valuesSrc.text, { commas: fromEnv, from: valuesSrc.from }) : [],
  );
  const valueCount = values.phones.length + values.emails.length + values.literals.length;
  // the known-number check is the one the generic phone rule cannot replace, so values without a phone do not count
  if (!values.phones.length)
    missing.push('private values with at least one "phone:" entry (PRIVACY_SCAN_PRIVATE / PRIVACY_SCAN_PRIVATE_FILE)');

  return {
    rules: [...GENERIC_RULES, ...priv.rules],
    values,
    allowEmails: new Set([SITE_EMAIL, ...(allow.emails ?? [])].map((e) => e.toLowerCase())),
    ignore: [
      ...(allow.ignore ?? []).map((e) => compileIgnore(e, ALLOW_FILE)),
      ...priv.ignore.map((e) => compileIgnore(e, 'private rules')),
    ],
    counts: { privateRules: priv.rules.length, privateValues: valueCount },
    missing,
    rejected,
    strict: isSet(process.env.CI) || isSet(process.env.PRIVACY_STRICT),
  };
}

// ───────────────────────────── normalization ─────────────────────────────
// Decoded view of a text plus a map back to the original offsets, so findings report the original line/column and
// context. One pass decodes entities / percent-escapes / \u escapes; NFKC folds full-width and compatibility
// characters; dash-like characters become "-", exotic spaces " ", zero-width characters disappear.
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  commat: '@',
  period: '.',
  hyphen: '-',
  dash: '-',
  ndash: '-',
  mdash: '-',
  minus: '-',
  plus: '+',
  lpar: '(',
  rpar: ')',
  sol: '/',
  bsol: '\\',
  colon: ':',
  semi: ';',
  comma: ',',
  num: '#',
  percnt: '%',
  dollar: '$',
  middot: '·',
  centerdot: '·',
  bull: '•',
  lowbar: '_',
  excl: '!',
  quest: '?',
  equals: '=',
  thinsp: ' ',
  ensp: ' ',
  emsp: ' ',
  hairsp: ' ',
  numsp: ' ',
  puncsp: ' ',
  zwnj: '',
  zwj: '',
  shy: '',
  lsqb: '[',
  rsqb: ']',
  lbrack: '[',
  rbrack: ']',
  lcub: '{',
  rcub: '}',
  ast: '*',
};
const ESCAPE_RE =
  /&#(\d{1,7});?|&#[xX]([0-9a-fA-F]{1,6});?|&([a-zA-Z]{2,10});|((?:%[0-9a-fA-F]{2})+)|\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})|\\\//g;
const NEEDS_NORMALIZING = /[^\x00-\x7f]|&#|&[a-zA-Z]{2,10};|%[0-9a-fA-F]{2}|\\u|\\x[0-9a-fA-F]|\\\//;
const DASHES = /[\p{Pd}−‐‑﹣－]/u;
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u00AD]/;
const SPACES = /[\p{Zs}\u00A0]/u;

function decodeEscape(m) {
  const [all, dec, hex, named, pct, ucb, u4, x2] = m;
  const cp = (n) => (n >= 0x20 && n <= 0x10ffff && !(n >= 0x7f && n < 0xa0) ? String.fromCodePoint(n) : null);
  if (dec) return cp(Number.parseInt(dec, 10));
  if (hex) return cp(Number.parseInt(hex, 16));
  if (named) return Object.hasOwn(NAMED_ENTITIES, named.toLowerCase()) ? NAMED_ENTITIES[named.toLowerCase()] : null;
  if (pct) {
    try {
      const s = decodeURIComponent(pct);
      return /[\x00-\x1f\x7f]/.test(s) ? null : s;
    } catch {
      return null;
    }
  }
  if (ucb) return cp(Number.parseInt(ucb, 16));
  if (u4) return cp(Number.parseInt(u4, 16));
  if (x2) return cp(Number.parseInt(x2, 16));
  if (all === '\\/') return '/';
  return null;
}

// Segment map from normalized offsets back to the source: identity runs (ASCII copied as is) and spans (one decoded
// escape or one non-ASCII character, whose output characters all map to the whole source span).
class OffsetMap {
  constructor() {
    this.n = [];
    this.o = [];
    this.oe = [];
  }
  identity(n, o) {
    this.n.push(n);
    this.o.push(o);
    this.oe.push(-1);
  }
  span(n, o, oe) {
    this.n.push(n);
    this.o.push(o);
    this.oe.push(oe);
  }
  #seg(i) {
    let lo = 0,
      hi = this.n.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.n[mid] <= i) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  start(i) {
    const k = this.#seg(i);
    return this.oe[k] < 0 ? this.o[k] + (i - this.n[k]) : this.o[k];
  }
  end(i) {
    const k = this.#seg(i);
    return this.oe[k] < 0 ? this.o[k] + (i - this.n[k]) + 1 : this.oe[k];
  }
}
const SPECIAL_RE = new RegExp(`${ESCAPE_RE.source}|[^\\x00-\\x7f]`, 'gu');
const foldChar = (ch) => {
  let out = '';
  for (const c of ch.normalize('NFKC')) {
    if (ZERO_WIDTH.test(c)) continue;
    out += DASHES.test(c) ? '-' : SPACES.test(c) ? ' ' : c;
  }
  return out;
};

function normalizePass(input) {
  const parts = [];
  const map = new OffsetMap();
  let n = 0,
    pos = 0,
    changed = false;
  for (const m of input.matchAll(SPECIAL_RE)) {
    let out;
    if (m[0].length === 1 || m[0].codePointAt(0) > 0x7f)
      out = foldChar(m[0]); // a non-ASCII character
    else {
      const d = decodeEscape(m);
      if (d === null) continue;
      out = [...d].map(foldChar).join('');
    }
    if (out === m[0]) continue; // unchanged: stays inside the identity run
    if (m.index > pos) {
      map.identity(n, pos);
      parts.push(input.slice(pos, m.index));
      n += m.index - pos;
    }
    if (out) {
      map.span(n, m.index, m.index + m[0].length);
      parts.push(out);
      n += out.length;
    }
    pos = m.index + m[0].length;
    changed = true;
  }
  if (!changed) return null;
  map.identity(n, pos);
  parts.push(input.slice(pos));
  return { text: parts.join(''), map };
}

/** Normalized view of `input` plus start(i)/end(i), the source span of normalized character i. Two passes, so
 * double encoding (an entity inside an entity, "%2540") is caught too. */
export function normalizeForScan(input) {
  const identity = { text: input, start: (i) => i, end: (i) => i + 1 };
  if (!NEEDS_NORMALIZING.test(input)) return identity;
  const p1 = normalizePass(input);
  if (!p1) return identity;
  const p2 = NEEDS_NORMALIZING.test(p1.text) ? normalizePass(p1.text) : null;
  if (!p2) return { text: p1.text, start: (i) => p1.map.start(i), end: (i) => p1.map.end(i) };
  return { text: p2.text, start: (i) => p1.map.start(p2.map.start(i)), end: (i) => p1.map.end(p2.map.end(i) - 1) };
}

// ───────────────────────────── text scanning ─────────────────────────────
/** Mask a match for reports: 2 leading and 2 trailing characters (phones: no digits at all). */
function mask(s, kind) {
  const t = s.replace(/\s+/g, ' ').trim();
  if (kind === 'phone') return t.replace(/\p{Nd}/gu, '•');
  if (t.length <= 6) return '*'.repeat(t.length);
  return `${t.slice(0, 2)}${'*'.repeat(Math.min(12, t.length - 4))}${t.slice(-2)}`;
}

function lineCol(text, idx) {
  let line = 1,
    last = 0;
  for (let i = text.indexOf('\n'); i !== -1 && i < idx; i = text.indexOf('\n', i + 1)) {
    line++;
    last = i + 1;
  }
  return { line, col: idx - last + 1 };
}

/** String literals of JS/CSS/source-map text (6+ characters, letters and digits or spaces), escapes as spaces. */
function* stringLiterals(text) {
  const re = /"((?:[^"\\\n]|\\.){6,})"|'((?:[^'\\\n]|\\.){6,})'|`((?:[^`\\]|\\.){6,})`/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const body = m[1] ?? m[2] ?? m[3];
    if (!/[A-Za-z]/.test(body) || !/[\d\s]/.test(body)) continue;
    yield { idx: m.index + 1, body: body.replace(/\\[nrtvf]/g, '  ').replace(/\\(["'`\\])/g, ' $1') };
  }
}

/** Context snippet of a finding in the original text, with every sensitive span in the window masked. */
function snippet(raw, f, all) {
  const start = Math.max(0, f.idx - 40),
    end = Math.min(raw.length, f.idx + f.len + 40);
  let ctx = '';
  let pos = start;
  // the finding itself sorts first among spans that start at the same place, so its own span is the one marked
  const spans = all
    .filter((x) => x.idx < end && x.idx + x.len > start)
    .sort((a, b) => a.idx - b.idx || (b === f) - (a === f));
  for (const g of spans) {
    const s0 = Math.max(g.idx, pos),
      s1 = Math.min(g.idx + g.len, end);
    if (s1 <= s0) continue;
    const piece = mask(raw.slice(s0, s1), g.kind);
    ctx += raw.slice(pos, s0) + (g === f ? `⟦${piece}⟧` : piece);
    pos = s1;
  }
  return (ctx + raw.slice(pos, end)).replace(/\s+/g, ' ');
}

/**
 * Scan one string. `mode`: 'prose' (HTML, JSON, Markdown, PDF text, metadata), 'code' (JS/CSS/maps: prose-only
 * rules run on string literals) or 'strings' (text pulled out of a binary: rules marked `binary` only).
 */
export function scanText(raw, { file = '<text>', mode = 'prose', source = 'text' } = {}, cfg = loadConfig()) {
  const { text, start, end } = normalizeForScan(raw);
  const found = [];
  const seen = new Set();
  const push = (rule, idx, len, extra = {}) => {
    const a = start(idx),
      b = Math.max(a + 1, end(idx + len - 1));
    const key = `${rule.id}:${a}:${b}`;
    if (seen.has(key)) return;
    seen.add(key);
    const match = raw.slice(a, b);
    const kind = rule.id.split('.')[0];
    found.push({
      rule: rule.id,
      severity: rule.severity,
      kind,
      desc: rule.desc,
      file,
      source,
      ...lineCol(raw, a),
      match: mask(match, kind),
      rawMatch: match,
      idx: a,
      len: b - a,
      ...extra,
    });
  };
  const runRegex = (rule, hay, offset, extra) => {
    for (const m of hay.matchAll(rule.re)) {
      if (rule.filter && !rule.filter(m[0], hay, m.index)) continue;
      if (rule.context && !rule.context.test(hay.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60)))
        continue;
      push(rule, offset + m.index, m[0].length, extra);
    }
  };
  for (const rule of cfg.rules) {
    if (mode === 'strings' && !rule.binary) continue;
    if (rule.where === 'prose' && mode !== 'prose') continue; // code: run on its string literals below
    if (rule.find) for (const [i, len, extra] of rule.find(text, cfg)) push(rule, i, len, extra);
    else runRegex(rule, text, 0);
  }
  if (mode === 'code') {
    const proseRules = cfg.rules.filter((r) => r.where === 'prose' && r.re);
    for (const lit of stringLiterals(text))
      for (const rule of proseRules) runRegex(rule, lit.body, lit.idx, { inLiteral: true });
  }
  for (const f of found) f.context = snippet(raw, f, found);
  for (const f of found) {
    delete f.idx;
    delete f.len;
  }
  return found;
}

// ───────────────────────────── file readers ─────────────────────────────
export async function pdfText(file) {
  const data = new Uint8Array(await readFile(file));
  const task = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  const parts = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    parts.push(tc.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join(''));
    for (const an of await page.getAnnotations())
      if (an.url || an.unsafeUrl) parts.push(`\n[link] ${an.url ?? an.unsafeUrl}\n`);
  }
  const meta = await doc.getMetadata().catch(() => ({}));
  const info = Object.fromEntries(
    Object.entries(meta.info ?? {}).filter(
      ([k, v]) => typeof v === 'string' && v && !['PDFFormatVersion', 'Language'].includes(k),
    ),
  );
  const xmp = meta.metadata?.getRaw?.() ?? '';
  await task.destroy();
  return { text: parts.join('\n'), info, xmp };
}

/**
 * Format of a file from its first bytes (see EXT_FORMAT for the names), or null when no binary format is recognized.
 * scanFile() asks only for files without a text extension or with control bytes in their first 4 KiB, so a text
 * file that happens to start like a signature stays text.
 */
export function sniff(head, ext = '') {
  const s = (a, b) => head.toString('latin1', a, b);
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (s(0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
  if (s(0, 6) === 'GIF87a' || s(0, 6) === 'GIF89a') return 'gif';
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return 'webp';
  if (s(0, 4) === 'II*\0' || s(0, 4) === 'MM\0*') return 'tiff';
  if (head.length >= 12 && head[0] === 0 && head[1] === 0) {
    const box = s(4, 8);
    if (box === 'ftyp') return IMAGE_BRANDS.has(s(8, 12)) ? 'heif' : 'mp4';
    if (['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(box)) return 'mp4'; // QuickTime without "ftyp"
  }
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return 'ebml';
  // a PDF may carry bytes before its header; only a file named .pdf is searched past the first byte
  const pdfAt = head.indexOf('%PDF-');
  if (pdfAt === 0 || (ext === '.pdf' && pdfAt > 0 && pdfAt < 1024)) return 'pdf';
  if (s(0, 4) === 'wOF2') return 'woff2';
  if (s(0, 4) === 'wOFF') return 'woff';
  if (s(0, 4) === 'OTTO' || (head.length >= 4 && head.readUInt32BE(0) === 0x00010000)) return 'sfnt';
  if (
    s(0, 2) === 'BM' &&
    head.length >= 18 &&
    head.readUInt32LE(6) === 0 &&
    [12, 40, 52, 56, 64, 108, 124].includes(head.readUInt32LE(14))
  )
    return 'bmp';
  if (head.length >= 6 && head.readUInt32BE(0) === 0x00000100 && head.readUInt16LE(4) > 0) return 'ico';
  if (s(0, 4) === 'PK\x03\x04') return 'zip';
  if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) return 'gzip';
  if (s(0, 4) === '\0asm') return 'wasm';
  return null;
}

async function readHead(file, n = 4096) {
  const fh = await open(file, 'r');
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

const EXIF_GPS_IFD = 0x8825,
  EXIF_SUB_IFD = 0x8769,
  EXIF_INTEROP_IFD = 0xa005,
  EXIF_MAKER_NOTE = 0x927c,
  EXIF_SERIALS = [0xa431, 0xa435];
const EXIF_POINTERS = new Set([EXIF_SUB_IFD, EXIF_GPS_IFD, EXIF_INTEROP_IFD]);
const GPS_POINTER_BYTES = [Buffer.from([0x88, 0x25]), Buffer.from([0x25, 0x88])];

/**
 * Tag ids of every IFD of an EXIF block: the IFD0 → IFD1 → … chain and the Exif, GPS and Interop sub-IFDs. Null when
 * the block is not TIFF; `partial` is set when a structure points outside the block.
 */
function exifTagIds(exif) {
  const t = exif.subarray(exif.toString('latin1', 0, 6) === 'Exif\0\0' ? 6 : 0);
  const order = t.toString('latin1', 0, 2);
  if (t.length < 8 || (order !== 'II' && order !== 'MM')) return null;
  const u16 = (o) => (order === 'II' ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o) => (order === 'II' ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const ids = new Set();
  const seen = new Set();
  const visit = (start, depth) => {
    for (let offset = start, hops = 0; offset && !seen.has(offset) && hops < 16; hops++) {
      seen.add(offset);
      const n = u16(offset);
      for (let i = 0; i < n; i++) {
        const entry = offset + 2 + i * 12;
        const tag = u16(entry);
        ids.add(tag);
        if (EXIF_POINTERS.has(tag) && depth < 4) visit(u32(entry + 8), depth + 1);
      }
      offset = u32(offset + 2 + n * 12); // next IFD in the chain (IFD0 → IFD1), 0 at the end
    }
  };
  try {
    visit(u32(4), 0);
  } catch {
    ids.partial = true;
  }
  return ids;
}

// GPS and location fields in XMP: exif:GPSLatitude, vendor spellings (drone-dji:GpsLongitude, gps_latitude), any
// namespaced latitude/longitude, and the IPTC / Photoshop location-name fields
const XMP_LOCATION =
  /\bgps_?(?:lat(?:itude)?|lon(?:g(?:itude)?)?|position|coordinates|altitude|dest\w*|area\w*)(?:ref)?\b|\b[\w-]+:(?:latitude|longitude|geolocation)\b|\bIptc4xmp(?:Core|Ext):Location\w*|\bphotoshop:(?:City|State|Country)\b/i;

async function imageMeta(file) {
  const m = await sharp(file, { failOn: 'none' }).metadata();
  const chunks = [];
  const flags = [];
  if (m.exif) {
    flags.push('EXIF');
    chunks.push(m.exif.toString('latin1'));
    const ids = exifTagIds(m.exif);
    // the parsed GPS pointer, or the pointer's bytes anywhere in the block: a GPS IFD the walk misses still fails
    if (ids?.has(EXIF_GPS_IFD) || GPS_POINTER_BYTES.some((b) => m.exif.includes(b))) flags.push('GPS');
    if (ids?.has(EXIF_MAKER_NOTE)) flags.push('maker note');
    if (EXIF_SERIALS.some((s) => ids?.has(s))) flags.push('serial number');
    if (!ids || ids.partial) flags.push('malformed EXIF');
  }
  if (m.xmp) {
    const xmp = m.xmp.toString('utf8');
    flags.push('XMP');
    if (XMP_LOCATION.test(xmp)) flags.push('GPS (XMP)');
    chunks.push(xmp);
  }
  if (m.iptc) {
    flags.push('IPTC');
    chunks.push(m.iptc.toString('latin1'));
  }
  for (const c of m.comments ?? []) {
    flags.push(`comment:${c.keyword}`);
    chunks.push(`${c.keyword}: ${c.text}`);
  }
  return { flags, text: chunks.join('\n') };
}

// ISO 6709 coordinates as video containers store them ("+00.0000+000.0000/"), and the boxes that hold a location in
// MP4/MOV files: QuickTime "©xyz" and 3GPP "loci" (binary coordinates)
const ISO6709 = /[+-]\d{2}(?:\d{2}){0,2}\.\d+[+-]\d{3}(?:\d{2}){0,2}\.\d+/;
const LOCATION_KEY = /location|gps|iso6709/i;
const LOCATION_BOXES = [
  ['©xyz', Buffer.from([0xa9, 0x78, 0x79, 0x7a])],
  ['loci', Buffer.from('loci', 'latin1')],
];

/** Whether `buf` holds an ISO-BMFF box of this type: the type bytes, preceded by a plausible box size. */
function hasBox(buf, type) {
  for (let i = buf.indexOf(type, 4); i !== -1; i = buf.indexOf(type, i + 1)) {
    const size = buf.readUInt32BE(i - 4);
    if (size >= 12 && size <= 4096) return true;
  }
  return false;
}

const FFPROBE = () => process.env.FFPROBE || 'ffprobe';
let ffprobeCheck = null;
/** Whether ffprobe can be started at all (checked once per run). A binary that runs but exits non-zero still counts. */
function ffprobeAvailable() {
  ffprobeCheck ??= execFile(FFPROBE(), ['-version']).then(
    () => true,
    (e) => typeof e?.code === 'number',
  );
  return ffprobeCheck;
}

/**
 * Video tags and any location found. Tags come from ffprobe; location boxes and XMP location fields are also looked
 * for in the raw header and tail, which is all a scan without ffprobe reads (strict scans refuse to go without it).
 * Throws (unscannable) when ffprobe fails on the file, or is missing in a strict scan.
 */
async function videoMeta(file, cfg) {
  const buf = await readFile(file);
  const raw = buf.length <= 524288 ? buf : Buffer.concat([buf.subarray(0, 262144), buf.subarray(buf.length - 262144)]);
  const strings = asciiStrings(raw);
  const box = LOCATION_BOXES.find(([, type]) => hasBox(raw, type));
  const inBytes = box ? `${box[0]} box` : XMP_LOCATION.test(strings) ? 'XMP location field' : null;
  if (await ffprobeAvailable()) {
    let stdout;
    try {
      ({ stdout } = await execFile(
        FFPROBE(),
        ['-v', 'error', '-show_entries', 'format_tags:stream_tags', '-of', 'json', file],
        { maxBuffer: 8 << 20 },
      ));
    } catch (e) {
      if (typeof e?.code !== 'number') throw new Error(`could not run ffprobe (${e?.code ?? e?.message ?? e})`);
      const why =
        String(e.stderr ?? '')
          .trim()
          .split('\n')
          .pop()
          ?.replace(`${file}: `, '')
          .slice(0, 200) || `exit ${e.code}`;
      throw new Error(`ffprobe could not read this file: ${why}`);
    }
    let j;
    try {
      j = JSON.parse(stdout);
    } catch {
      throw new Error('ffprobe output is not JSON');
    }
    const tags = { ...(j.format?.tags ?? {}) };
    for (const s of j.streams ?? []) for (const [k, v] of Object.entries(s.tags ?? {})) tags[`stream.${k}`] = v;
    const hit = Object.entries(tags).find(([k, v]) => LOCATION_KEY.test(k) || ISO6709.test(String(v)));
    return {
      location: hit ? `tag ${hit[0]}` : inBytes,
      text: Object.entries(tags)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n'),
      engine: 'ffprobe',
    };
  }
  if (cfg.strict)
    throw new Error(
      `ffprobe not available (${FFPROBE()}); set FFPROBE or install ffmpeg, video tags cannot be checked`,
    );
  const location =
    inBytes ??
    (ISO6709.test(strings) ? 'ISO 6709 coordinates' : /\blocation\b|iso6709/i.test(strings) ? '"location" key' : null);
  return { location, text: strings, engine: 'bytes' };
}

function asciiStrings(buf, min = 6) {
  const out = [];
  let cur = '';
  for (const b of buf) {
    if (b >= 0x20 && b < 0x7f) cur += String.fromCharCode(b);
    else {
      if (cur.length >= min) out.push(cur);
      cur = '';
    }
  }
  if (cur.length >= min) out.push(cur);
  return out.join('\n');
}

const metaFinding = (rule, severity, desc, file, source, context = '') => ({
  rule,
  severity,
  kind: 'metadata',
  desc,
  file,
  source,
  line: 0,
  col: 0,
  match: '',
  context,
});

// control bytes that text files do not contain (tab, newline, carriage return, form feed and escape excepted)
const CONTROL_BYTES = /[\x00-\x08\x0e-\x1a\x1c-\x1f]/;

/**
 * Scan one file: { file, kind, findings, notes, error? }. The content picks the reader; a file whose content
 * contradicts its extension is still read by its content, and is also reported as unscannable.
 */
export async function scanFile(abs, cfg, relTo = process.cwd()) {
  const file = path.relative(relTo, abs).split(path.sep).join('/') || path.basename(abs);
  const ext = path.extname(abs).toLowerCase();
  const res = { file, kind: 'binary', findings: [], notes: [] };
  const scan = (text, mode, source) => res.findings.push(...scanText(text, { file, mode, source }, cfg));
  const problems = [];
  try {
    const head = await readHead(abs);
    const textual = TEXT_EXT.has(ext);
    const format = textual && !CONTROL_BYTES.test(head.toString('latin1')) ? null : sniff(head, ext);
    const promised = EXT_FORMAT[ext];
    if (format && textual && ext) problems.push(`content is ${format}, but the extension ${ext} is a text type`);
    else if (format && promised && promised !== format)
      problems.push(`content is ${format}, but the extension ${ext} promises ${promised}`);
    else if (!format && promised) problems.push(`content is not the ${promised} its extension ${ext} promises`);
    const reader = format ? FORMAT_READER[format] : textual ? 'text' : 'strings';

    if (reader === 'pdf') {
      res.kind = 'pdf';
      const { text, info, xmp } = await pdfText(abs);
      res.notes.push(`pdf text: ${text.length} chars`);
      scan(text, 'prose', 'pdf-text');
      if (Object.keys(info).length || xmp) {
        res.findings.push(
          metaFinding(
            'metadata.pdf',
            'warn',
            `PDF metadata present (${Object.keys(info).join(', ') || 'XMP'})`,
            file,
            'pdf-meta',
          ),
        );
        scan(
          `${Object.entries(info)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')}\n${xmp}`,
          'prose',
          'pdf-meta',
        );
      }
    } else if (reader === 'image') {
      res.kind = 'image';
      const { flags, text } = await imageMeta(abs);
      const gps = flags.includes('GPS') ? 'EXIF' : flags.includes('GPS (XMP)') ? 'XMP' : null;
      if (gps)
        res.findings.push(
          metaFinding('metadata.gps', 'error', `GPS location in image ${gps}`, file, 'image-meta', flags.join(', ')),
        );
      else if (flags.length)
        res.findings.push(
          metaFinding('metadata.image', 'warn', `image metadata present (${flags.join(', ')})`, file, 'image-meta'),
        );
      if (text) scan(text, 'prose', 'image-meta');
    } else if (reader === 'video') {
      res.kind = 'video';
      const { location, text, engine } = await videoMeta(abs, cfg);
      res.notes.push(`video metadata via ${engine}`);
      if (location)
        res.findings.push(metaFinding('metadata.gps', 'error', `location in video (${location})`, file, 'video-meta'));
      if (text) scan(text, engine === 'bytes' ? 'strings' : 'prose', 'video-meta');
    } else if (reader === 'text') {
      res.kind = CODE_EXT.has(ext) ? 'code' : 'text';
      scan(await readFile(abs, 'utf8'), CODE_EXT.has(ext) ? 'code' : 'prose', 'text');
    } else {
      scan(asciiStrings(await readFile(abs)), 'strings', 'binary-strings');
    }
  } catch (e) {
    problems.push(String(e?.message ?? e));
  }
  if (problems.length) res.error = problems.join('; ');
  return res;
}

async function* walk(p) {
  if ((await stat(p)).isFile()) {
    yield p;
    return;
  }
  for (const ent of await readdir(p, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const q = path.join(p, ent.name);
    if (ent.isDirectory()) yield* walk(q);
    else if (ent.isFile()) yield q;
  }
}

/** Scan files and directories: { files, findings, errors, counts }. Paths are reported relative to a single
 * directory target, else to the working directory. */
export async function scanPaths(targets, cfg = loadConfig()) {
  const files = [];
  for (const t of targets) for await (const f of walk(path.resolve(t))) files.push(f);
  const base =
    targets.length === 1 && (await stat(targets[0])).isDirectory() ? path.resolve(targets[0]) : process.cwd();
  const results = [];
  const queue = [...files];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) results.push(await scanFile(f, cfg, base));
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  results.sort((a, b) => a.file.localeCompare(b.file));
  const findings = [];
  for (const r of results) {
    r.findings = r.findings.filter(
      (f) =>
        !cfg.ignore.some(
          (ig) =>
            (!ig.rule || ig.rule === f.rule) &&
            (!ig.fileRe || ig.fileRe.test(r.file)) &&
            (!ig.matchRe || ig.matchRe.test(f.rawMatch ?? '')),
        ),
    );
    for (const f of r.findings) {
      delete f.rawMatch;
      findings.push(f);
    }
  }
  const errors = results.filter((r) => r.error).map((r) => ({ file: r.file, error: r.error }));
  const count = (sev) => findings.filter((f) => f.severity === sev).length;
  return {
    files: results.map((r) => ({
      file: r.file,
      kind: r.kind,
      findings: r.findings.length,
      notes: r.notes,
      error: r.error,
    })),
    findings,
    errors,
    counts: {
      files: results.length,
      error: count('error'),
      warn: count('warn'),
      unscannable: errors.length,
      ...cfg.counts,
      rejectedValues: cfg.rejected?.length ?? 0,
    },
    videoTagsFromBytes: results.some((r) => r.notes.includes('video metadata via bytes')),
  };
}

export function formatReport(report) {
  const lines = [];
  const byFile = new Map();
  for (const f of report.findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
  for (const [file, fs] of byFile) {
    lines.push(`\n${file}`);
    for (const f of fs) {
      const at = f.line ? `${f.line}:${f.col}` : '';
      lines.push(
        `  ${f.severity === 'error' ? 'ERROR' : 'warn '} ${f.rule.padEnd(24)} ${at.padEnd(9)} ${f.desc}${f.context ? `  …${f.context.slice(0, 140)}…` : ''}`,
      );
    }
  }
  for (const e of report.errors) lines.push(`\n${e.file}\n  ERROR could-not-scan            ${e.error}`);
  const c = report.counts;
  if (report.videoTagsFromBytes) lines.push(`\n${FFPROBE_WARNING}`);
  lines.push(
    `\nprivacy-scan: ${c.files} files · ${c.error} errors · ${c.warn} warnings · ${c.unscannable} unscannable` +
      ` · private: ${c.privateRules} rules, ${c.privateValues} values`,
  );
  return lines.join('\n');
}

const FFPROBE_WARNING =
  'warning: ffprobe not found (set FFPROBE or add it to PATH); video tags were read from raw bytes, ' +
  'which finds location atoms and coordinates only. CI, PRIVACY_STRICT=1 or --strict make this an error.';

const USAGE = 'usage: node scripts/privacy-scan.mjs [--strict] [--quiet] [--json <report.json>] <dir|file>...';

async function main(argv) {
  const opt = { strict: false, quiet: false, json: null, targets: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strict') opt.strict = true;
    else if (a === '--quiet') opt.quiet = true;
    else if (a === '--json') opt.json = argv[++i] ?? '';
    else if (a === '-h' || a === '--help') {
      console.log(`${USAGE}\n(see the header of this file)`);
      return 0;
    } else if (a === '--') {
      opt.targets.push(...argv.slice(i + 1));
      break;
    } else if (a.startsWith('--')) {
      console.error(`privacy-scan: unknown option ${a}\n${USAGE}`);
      return 2;
    } else opt.targets.push(a);
  }
  if (!opt.targets.length || opt.json === '') {
    console.error(USAGE);
    return 2;
  }
  for (const t of opt.targets)
    if (!existsSync(t)) {
      console.error(`privacy-scan: not found: ${t}`);
      return 2;
    }

  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    console.error(`privacy-scan: ${e.message}`);
    return 2;
  }
  cfg.strict ||= opt.strict;
  // rejected entries are listed by position and reason only, never by value
  for (const r of cfg.rejected)
    console.error(`privacy-scan: ${cfg.strict ? '' : 'warning: '}rejected private value at ${r.where} (${r.reason})`);
  if (cfg.rejected.length && cfg.strict) {
    console.error(`privacy-scan: ${cfg.rejected.length} private value(s) rejected; refusing to report clean.`);
    return 2;
  }
  if (cfg.missing.length) {
    const what = cfg.missing.join(' and ');
    if (cfg.strict) {
      console.error(`privacy-scan: missing ${what}; refusing to report clean.`);
      return 2;
    }
    console.error(`privacy-scan: warning: missing ${what}; scanning without them.`);
  }

  const report = await scanPaths(opt.targets, cfg);
  if (opt.json) await writeFile(opt.json, `${JSON.stringify(report, null, 2)}\n`);
  const failed = report.counts.error > 0 || report.errors.length > 0 || (opt.strict && report.counts.warn > 0);
  if (!opt.quiet || failed) console.log(formatReport(report).trimStart());
  else if (report.videoTagsFromBytes) console.error(`privacy-scan: ${FFPROBE_WARNING}`);
  if (report.errors.length) return 2;
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e?.stack ?? e);
      process.exit(2);
    },
  );
}
