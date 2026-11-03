#!/usr/bin/env node
/**
 * Post-build gate for dist/. `npm run build` runs it after `astro build`, so nothing ships that fails it.
 *
 * Checks, in order:
 *   1. allowlist  dist/ holds only pages, media, the font license, bundled scripts and styles, and a few named root
 *                 files. The font itself is inlined into each page's CSS, so no font file ships.
 *   2. origin     no local-machine URL in any text file; every canonical link, og:url and og:image is an absolute
 *                 URL on the configured site (SITE_URL, or the same default as astro.config.mjs), and names a file
 *                 that dist/ serves.
 *   3. budgets    the "dist" limits in scripts/budgets.json.
 *   4. privacy    scripts/privacy-scan.mjs over dist/.
 *
 * Each failure is one line; a summary line follows. Exit 0 = pass, 1 = failures, 2 = usage or setup error: bad
 * arguments, an unreadable budgets.json or SITE_URL, or a privacy scan that could not run to the end (it exited 2:
 * private data missing where required, malformed private rules, an unscannable file) with no other failure.
 * `--external-links` is a separate, manual mode that needs the network (see --help).
 *
 * Node built-ins only; the privacy scan it starts has its own dependencies.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');

// Keep in step with astro.config.mjs (`site`). The site is served from the root of this origin.
const DEFAULT_SITE = 'https://im-yifanluo.github.io';

const HELP = `Usage:
  node scripts/check-dist.mjs [--strict] [--report] [dist-dir]
  node scripts/check-dist.mjs --external-links [dist-dir]

Checks a built site (default: dist/ at the repository root) and exits 1 on any failure.

  allowlist  only these may ship: */index.html pages (redirect pages included), 404.html,
             media/** as .avif .webp .jpg .png .svg .mp4 .webm, fonts/OFL.txt (no font file:
             the font is inlined into the CSS),
             _astro/*.js, _astro/*.css, og.jpg, favicon.svg, apple-touch-icon.png,
             yifan-luo-resume.pdf, sitemap-*.xml, robots.txt. Never a .json file. index.html and
             404.html must exist.
  origin     no localhost, 127.0.0.1, [::1] or file:/ URL in any text file. Every page has one
             canonical link (404.html may have none); it and every og:url, og:image, twitter:url
             and twitter:image start with the site URL. Canonical links and og:image must name a
             file in dist (query and fragment ignored); 404.html's canonical is not resolved, as
             that page is served for every missing URL.
  budgets    every "scope": "dist" entry in scripts/budgets.json.
  privacy    node scripts/privacy-scan.mjs <dist-dir>; its findings fail the build.

Options:
  --strict          pass --strict on to the privacy scan.
  --report          also print the largest measured value for each budget.
  --external-links  only check external links instead: HEAD, then GET on failure; 4 at a time,
                    10 s timeout each. Hosts that refuse automated requests (linkedin.com) are
                    skipped. Report only: exits 0 even when links are broken.
  -h, --help        show this text.

Environment:
  SITE_URL                   the site the canonical URLs must use (default ${DEFAULT_SITE}).
  CHECK_DIST_SKIP_PRIVACY=1  skip the privacy scan. Only for testing this script on a copied dist;
                             refused (a failure) when CI or PRIVACY_STRICT=1 is set.
  CI, PRIVACY_STRICT, PRIVACY_SCAN_*  passed through to the privacy scan unchanged.
`;

// ---------------------------------------------------------------------------------------------------------------
// arguments

function parseArgs(argv) {
  const opt = { strict: false, report: false, links: false, help: false, dist: null };
  for (const a of argv) {
    if (a === '-h' || a === '--help') opt.help = true;
    else if (a === '--strict') opt.strict = true;
    else if (a === '--report') opt.report = true;
    else if (a === '--external-links') opt.links = true;
    else if (a.startsWith('-')) usage(`unknown option ${a}`);
    else if (opt.dist) usage('only one dist directory can be checked at a time');
    else opt.dist = resolve(a);
  }
  opt.dist ??= join(ROOT, 'dist');
  return opt;
}

function usage(message) {
  console.error(`check-dist: ${message}\n\n${HELP}`);
  process.exit(2);
}

function siteUrl() {
  const raw = process.env.SITE_URL || DEFAULT_SITE;
  let url;
  try {
    url = new URL(raw);
  } catch {
    usage(`SITE_URL is not a URL: ${raw}`);
  }
  if (!/^https?:$/.test(url.protocol)) usage(`SITE_URL must be http(s): ${raw}`);
  // Canonical URLs are compared as prefixes, so the site always ends in "/".
  return url.origin + (url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`);
}

// ---------------------------------------------------------------------------------------------------------------
// shared helpers

const failures = [];
const fail = (check, message) => failures.push({ check, message });

const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;
const bytes = (s) => Buffer.byteLength(s, 'utf8');

/** Every entry under dir, as POSIX paths relative to dir, with lstat results, in a stable order. */
function walk(dir, base = dir, out = []) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = relative(base, abs).split(sep).join('/');
    if (entry.isDirectory()) walk(abs, base, out);
    else out.push({ rel, abs, stat: lstatSync(abs) });
  }
  return out;
}

const ENTITY = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
const codePoint = (n, m) => (n <= 0x10ffff ? String.fromCodePoint(n) : m);
const decode = (s) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, dec, hex, name) =>
    dec ? codePoint(+dec, m) : hex ? codePoint(parseInt(hex, 16), m) : (ENTITY[name.toLowerCase()] ?? m),
  );

const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
function attrs(source) {
  const out = {};
  for (const m of source.matchAll(ATTR)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

/** Start tags of the given names, with their attributes. */
function tags(html, names) {
  const re = new RegExp(`<(${names.join('|')})\\b([^>]*)>`, 'gi');
  return [...html.matchAll(re)].map((m) => ({ name: m[1].toLowerCase(), attrs: attrs(m[2]) }));
}

/** The URL path a page is served at: index.html -> /, a/index.html -> /a/, 404.html -> /404.html. */
const pagePath = (rel) => `/${rel.replace(/(^|\/)index\.html$/, '$1')}`;

// ---------------------------------------------------------------------------------------------------------------
// 1. allowlist

const DENIED = [[/\.json$/i, 'JSON file; reports and data files do not ship']];
const ALLOWED = [
  /^(?:[^/]+\/)*index\.html$/, // pages, including redirect pages (build.format "directory")
  /^404\.html$/,
  /^media\/(?:[^/]+\/)*[^/]+\.(?:avif|webp|jpg|png|svg|mp4|webm)$/, // what the media scripts write
  /^fonts\/OFL\.txt$/, // the font's license (the font itself is inlined into each page's CSS)
  /^_astro\/[^/]+\.(?:js|css)$/, // component scripts, and stylesheets should one stop being inlined
  /^(?:og\.jpg|favicon\.svg|apple-touch-icon\.png|yifan-luo-resume\.pdf|robots\.txt)$/,
  /^sitemap-[^/]+\.xml$/,
];
const REQUIRED = ['index.html', '404.html'];

function checkAllowlist(files) {
  // Group by top-level entry so a whole unexpected folder is one line, not one per file.
  const groups = new Map();
  for (const { rel, stat } of files) {
    const denied = DENIED.find(([re]) => re.test(rel));
    const reason = stat.isSymbolicLink()
      ? 'symbolic link'
      : denied
        ? denied[1]
        : ALLOWED.some((re) => re.test(rel))
          ? null
          : 'not an allowed path';
    if (!reason) continue;
    const top = rel.includes('/') ? `${rel.split('/')[0]}/` : rel;
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top).push({ rel, reason });
  }
  for (const [top, list] of groups) {
    if (list.length === 1) fail('allowlist', `${list[0].rel}: ${list[0].reason}`);
    else {
      const reasons = [...new Set(list.map((f) => f.reason))].join('; ');
      fail('allowlist', `${top} (${list.length} files, e.g. ${list[0].rel}): ${reasons}`);
    }
  }
  const present = new Set(files.map((f) => f.rel));
  for (const rel of REQUIRED) if (!present.has(rel)) fail('allowlist', `${rel}: missing`);
}

// ---------------------------------------------------------------------------------------------------------------
// 2. origin

const TEXT = /\.(?:html|xml|txt|js|mjs|css|svg|json|webmanifest|map|md)$/i;
const LOCAL = [
  ['localhost', /\blocalhost\b/gi],
  ['127.0.0.1', /\b127\.0\.0\.1\b/g],
  ['[::1]', /\[::1\]/g],
  ['a file:/ URL', /\bfile:\//gi],
];
const ABSOLUTE_META = new Set(['og:url', 'og:image', 'og:image:url', 'og:image:secure_url', 'twitter:url', 'twitter:image']);

function excerpt(text, index) {
  const s = text.slice(Math.max(0, index - 30), index + 40).replace(/\s+/g, ' ');
  return `"…${s}…"`;
}

function checkLocalUrls(files) {
  for (const { rel, abs, stat } of files) {
    if (!stat.isFile() || !TEXT.test(rel)) continue;
    const text = readFileSync(abs, 'utf8');
    for (const [label, re] of LOCAL) {
      const hits = [...text.matchAll(re)];
      if (!hits.length) continue;
      const line = text.slice(0, hits[0].index).split('\n').length;
      const count = hits.length > 1 ? ` (${hits.length}×)` : '';
      fail('origin', `${rel}:${line}: ${label}${count} ${excerpt(text, hits[0].index)}`);
    }
  }
}

/** The dist file a site URL is served from, or null when the URL is not on the site. */
function fileForUrl(url, site, dist) {
  if (!url.startsWith(site)) return null;
  let path = url.slice(site.length).replace(/[?#].*$/, '');
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (path === '' || path.endsWith('/')) path += 'index.html';
  return join(dist, ...path.split('/'));
}

/** Whether a site URL names a regular file in dist (a directory URL without its trailing slash does not). */
const served = (url, site, dist) => {
  const file = fileForUrl(url, site, dist);
  return !!file && existsSync(file) && lstatSync(file).isFile();
};

function checkPageUrls(pages, site, dist) {
  for (const { rel, html } of pages) {
    const canonical = tags(html, ['link'])
      .filter((t) => (t.attrs.rel ?? '').toLowerCase().split(/\s+/).includes('canonical'))
      .map((t) => t.attrs.href ?? '');
    // 404.html is served for every missing URL, so it has no URL of its own to resolve
    const notFound = rel === '404.html';
    if (canonical.length === 0 && !notFound) fail('origin', `${rel}: no <link rel="canonical">`);
    if (canonical.length > 1) fail('origin', `${rel}: ${canonical.length} canonical links`);
    for (const href of canonical) {
      if (!href.startsWith(site)) fail('origin', `${rel}: canonical ${href} is not on ${site}`);
      else if (!notFound && !served(href, site, dist)) fail('origin', `${rel}: canonical ${href} has no page in dist`);
    }

    for (const { attrs: a } of tags(html, ['meta'])) {
      const key = (a.property ?? a.name ?? '').toLowerCase();
      if (!ABSOLUTE_META.has(key)) continue;
      const value = a.content ?? '';
      if (!value.startsWith(site)) {
        fail('origin', `${rel}: ${key} ${value || '(empty)'} is not on ${site}`);
        continue;
      }
      if (key.includes('image') && !served(value, site, dist)) fail('origin', `${rel}: ${key} ${value} has no file in dist`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 3. budgets

const BUDGET_FILE = join(here, 'budgets.json');
const DIST_KEYS = ['publicFileBytes', 'tileLoopBytes', 'heroLoopBytes', 'htmlBytes', 'inlineCssBytes', 'inlineJsBytes', 'externalJsBytes'];

// Loop renditions are named <name>-<width>.mp4|webm. A tile loop's base rendition is 640 px wide; anything wider is
// its high-density rendition. Hero loops carry "-hero-" in the name, or are rendered at the hero width or wider.
const LOOP = /^media\/(.+)-(\d+)\.(?:mp4|webm)$/i;
const VIDEO = /^media\/.+\.(?:mp4|webm)$/i;
const TILE_WIDTH = 640;
const HERO_WIDTH = 1280;

function loadBudgets() {
  let budgets;
  try {
    budgets = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
  } catch (e) {
    console.error(`check-dist: cannot read scripts/budgets.json: ${e.message}`);
    process.exit(2);
  }
  const bad = DIST_KEYS.filter((k) => !Number.isFinite(budgets[k]?.max));
  if (!Number.isFinite(budgets.tileLoopBytes?.maxHiDpi)) bad.push('tileLoopBytes.maxHiDpi');
  if (bad.length) {
    console.error(`check-dist: scripts/budgets.json lacks a numeric limit for ${bad.join(', ')}`);
    process.exit(2);
  }
  return budgets;
}

/** The budget that applies to one loop file, or null when the file is not a loop. */
function loopLimit(rel, B) {
  if (!VIDEO.test(rel)) return null;
  const m = LOOP.exec(rel);
  if (!m) return { key: 'tileLoopBytes', max: B.tileLoopBytes.max }; // no width in the name: the strictest limit
  const [, name, width] = m;
  if (/(?:^|-)hero(?:-|$)/i.test(name) || +width >= HERO_WIDTH) return { key: 'heroLoopBytes', max: B.heroLoopBytes.max };
  if (+width > TILE_WIDTH) return { key: 'tileLoopBytes', max: B.tileLoopBytes.maxHiDpi, label: 'tileLoopBytes.maxHiDpi' };
  return { key: 'tileLoopBytes', max: B.tileLoopBytes.max };
}

/** Byte totals of inline <style> and inline JavaScript <script> elements. Data blocks (JSON) are not JavaScript. */
function inlineBytes(html) {
  let css = 0;
  let js = 0;
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) css += bytes(m[1]);
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const a = attrs(m[1]);
    if ('src' in a) continue;
    const type = (a.type ?? '').trim().toLowerCase();
    if (type === '' || type === 'module' || /^(?:text|application)\/(?:java|ecma)script$/.test(type)) js += bytes(m[2]);
  }
  return { css, js };
}

function checkBudgets(files, pages, B) {
  const seen = {}; // largest measured value per budget, for --report
  const measure = (key, value, where, limit) => {
    if (!seen[key] || value > seen[key].value) seen[key] = { value, where, limit };
  };
  const over = (label, rel, value, max) => fail('budgets', `${rel}: ${kib(value)}, over ${label} ${kib(max)}`);

  let jsTotal = 0;
  let jsFiles = 0;
  for (const { rel, stat } of files) {
    if (!stat.isFile() || rel.endsWith('.html')) continue;
    measure('publicFileBytes', stat.size, rel, B.publicFileBytes.max);
    if (stat.size > B.publicFileBytes.max) over('publicFileBytes', rel, stat.size, B.publicFileBytes.max);
    if (/^_astro\/[^/]+\.js$/.test(rel)) {
      jsTotal += stat.size;
      jsFiles++;
    }
    const loop = loopLimit(rel, B);
    if (loop) {
      measure(loop.label ?? loop.key, stat.size, rel, loop.max);
      if (stat.size > loop.max) over(loop.label ?? loop.key, rel, stat.size, loop.max);
    }
  }
  measure('externalJsBytes', jsTotal, `${jsFiles} file(s) in _astro/`, B.externalJsBytes.max);
  if (jsTotal > B.externalJsBytes.max) over('externalJsBytes', `_astro/*.js (${jsFiles} files)`, jsTotal, B.externalJsBytes.max);

  for (const { rel, html, size } of pages) {
    const { css, js } = inlineBytes(html);
    for (const [key, value] of [['htmlBytes', size], ['inlineCssBytes', css], ['inlineJsBytes', js]]) {
      measure(key, value, rel, B[key].max);
      if (value > B[key].max) over(key, rel, value, B[key].max);
    }
  }
  return seen;
}

function printReport(seen) {
  console.log('budget                   largest     limit       headroom  where');
  for (const [key, { value, where, limit }] of Object.entries(seen).sort(([a], [b]) => a.localeCompare(b))) {
    const headroom = limit ? `${Math.round((1 - value / limit) * 100)} %` : '';
    console.log(`${key.padEnd(24)} ${kib(value).padStart(11)} ${kib(limit).padStart(11)} ${headroom.padStart(9)}  ${where}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 4. privacy

// Same reading of flag variables as privacy-scan.mjs: unset, empty, 0, false, no and off all mean "not set".
const isSet = (v) => !!v && !/^(?:0|false|no|off)$/i.test(v);

/** Runs the scanner; returns its exit status (null when it did not run or was killed). */
function runPrivacyScan(dist, strict) {
  if (isSet(process.env.CHECK_DIST_SKIP_PRIVACY)) {
    if (isSet(process.env.CI) || isSet(process.env.PRIVACY_STRICT)) {
      fail('privacy', 'CHECK_DIST_SKIP_PRIVACY=1 is refused when CI or PRIVACY_STRICT=1 is set');
    } else {
      console.log('note: privacy scan skipped (CHECK_DIST_SKIP_PRIVACY=1)');
    }
    return null;
  }
  const scanner = join(here, 'privacy-scan.mjs');
  if (!existsSync(scanner)) {
    fail('privacy', 'scripts/privacy-scan.mjs not found');
    return null;
  }
  const run = spawnSync(process.execPath, [scanner, ...(strict ? ['--strict'] : []), dist], { stdio: 'inherit' });
  if (run.error) fail('privacy', `could not run scripts/privacy-scan.mjs: ${run.error.message}`);
  else if (run.status === 2) fail('privacy', 'scripts/privacy-scan.mjs exited 2: setup error or unscannable file (see its output above)');
  else if (run.status !== 0) fail('privacy', `scripts/privacy-scan.mjs exited ${run.status ?? run.signal} (see its output above)`);
  return run.error ? null : run.status;
}

// ---------------------------------------------------------------------------------------------------------------
// --external-links

const SKIP_HOSTS = ['linkedin.com']; // answers automated requests with status 999 or a sign-in wall
const LINK_TIMEOUT_MS = 10_000;
const LINK_CONCURRENCY = 4;

function externalUrls(pages, site) {
  const found = new Map(); // url -> pages that use it
  for (const { rel, html } of pages) {
    for (const { attrs: a } of tags(html, ['a', 'link', 'img', 'source', 'video', 'audio', 'script', 'iframe'])) {
      const candidates = [a.href, a.src, a.poster, ...(a.srcset ?? '').split(',').map((s) => s.trim().split(/\s+/)[0])];
      for (const url of candidates) {
        if (!url || !/^https?:\/\//i.test(url) || url.startsWith(site)) continue;
        if (!found.has(url)) found.set(url, new Set());
        found.get(url).add(pagePath(rel));
      }
    }
  }
  return found;
}

const skipped = (url) => {
  const host = new URL(url).hostname.toLowerCase();
  return SKIP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
};

async function probe(url) {
  let result;
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(LINK_TIMEOUT_MS) });
      await res.body?.cancel();
      if (res.status < 400) return { ok: true, status: String(res.status) };
      result = { ok: false, status: `${res.status}${method === 'GET' ? '' : ' (HEAD)'}` };
    } catch (e) {
      const reason = e.name === 'TimeoutError' ? `timeout ${LINK_TIMEOUT_MS / 1000} s` : (e.cause?.code ?? e.message);
      result = { ok: false, status: reason };
    }
  }
  return result;
}

async function checkExternalLinks(pages, site) {
  const found = externalUrls(pages, site);
  const queue = [...found.keys()].sort();
  const results = new Map();
  await Promise.all(
    Array.from({ length: LINK_CONCURRENCY }, async () => {
      while (queue.length) {
        const url = queue.shift();
        results.set(url, skipped(url) ? { skipped: true } : await probe(url));
      }
    }),
  );
  let ok = 0;
  let broken = 0;
  let skip = 0;
  for (const [url, r] of [...results].sort(([a], [b]) => a.localeCompare(b))) {
    const on = [...found.get(url)].join(', ');
    if (r.skipped) {
      skip++;
      console.log(`skipped  ${url}  (host refuses automated requests; on ${on})`);
    } else if (r.ok) ok++;
    else {
      broken++;
      console.log(`broken   ${r.status}  ${url}  (on ${on})`);
    }
  }
  console.log(`check-dist --external-links: ${found.size} external links, ${ok} ok, ${broken} broken, ${skip} skipped (report only)`);
}

// ---------------------------------------------------------------------------------------------------------------
// main

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.help) {
    console.log(HELP);
    return 0;
  }
  if (!existsSync(opt.dist) || !lstatSync(opt.dist).isDirectory()) {
    console.error(`check-dist: ${opt.dist} is not a directory (run astro build first)`);
    return 2;
  }
  const site = siteUrl();
  const files = walk(opt.dist);
  const pages = files
    .filter((f) => f.stat.isFile() && f.rel.endsWith('.html'))
    .map((f) => ({ rel: f.rel, html: readFileSync(f.abs, 'utf8'), size: f.stat.size }));

  if (opt.links) {
    await checkExternalLinks(pages, site);
    return 0;
  }

  const budgets = loadBudgets();
  checkAllowlist(files);
  checkLocalUrls(files);
  checkPageUrls(pages, site, opt.dist);
  const seen = checkBudgets(files, pages, budgets);

  for (const { check, message } of failures) console.log(`FAIL ${check}: ${message}`);
  if (opt.report) printReport(seen);
  const privacyStatus = runPrivacyScan(opt.dist, opt.strict);
  for (const f of failures.filter((f) => f.check === 'privacy')) console.log(`FAIL ${f.check}: ${f.message}`);

  const rel = relative(process.cwd(), opt.dist);
  const where = rel === '' ? '.' : rel.startsWith('..') ? opt.dist : rel;
  if (!failures.length) {
    console.log(`check-dist: ${where} ok (${files.length} files, ${pages.length} pages, site ${site})`);
    return 0;
  }
  const byCheck = {};
  for (const f of failures) byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;
  const counts = Object.entries(byCheck).map(([k, n]) => `${k} ${n}`).join(', ');
  console.log(`check-dist: ${where} FAILED, ${failures.length} failure(s): ${counts}`);
  // a scan that could not run to the end is a setup error, unless something else failed as well
  return privacyStatus === 2 && failures.every((f) => f.check === 'privacy') ? 2 : 1;
}

process.exitCode = await main();
