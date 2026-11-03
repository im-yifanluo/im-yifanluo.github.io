#!/usr/bin/env node
/**
 * Per-role metric-matched fallback faces → src/styles/fallbacks.css (headless Chrome only).
 *
 *   npm run fonts:fallbacks [-- --base http://localhost:4321 --rounds 3]
 *   npm run fonts:fallbacks -- --help
 *
 * Why: the font is inlined with font-display: block (src/styles/fonts.css), so a normal visit never paints in a
 * fallback. Text is laid out in one only if the inline font fails to load or outlasts the block period; the font then
 * swaps in over it, and any width difference would re-wrap lines and shift the page (CLS). One fallback tuned at the
 * body weight is 4–6 % too narrow for the 400-weight name/headings (measured). So every role (name, h2, title, body,
 * meta, date) gets its own local() face whose size-adjust makes the fallback's mean width over every string of that
 * role, on every page, equal the real face's. ascent/descent overrides keep the real font's vertical metrics (hhea ÷
 * size-adjust), so line boxes never change. Zero bytes: local() faces of system fonts. Each round measures with the
 * current file and refines, rebuilds dist/ between rounds, and prints its measurements as a table. The pages measured
 * are the homepage and every project it lists.
 *
 * Needs a running server for the site at --base (the dev server, or `npm run preview`), Chrome on the machine, and the
 * `playwright` package, which is not a dependency of the site (`npm i --no-save playwright`).
 * Exit codes: 0 done, 1 a failed run, 2 a usage error or a missing `playwright`.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const USAGE = `usage: npm run fonts:fallbacks [-- --base <url> --rounds <n>]
  --base <url>   the running site to measure (default http://localhost:4321: npm run dev, or npm run preview)
  --rounds <n>   measure-and-refine rounds, with a rebuild of dist/ between them (default 3)
  -h, --help     show this text`;
const args = process.argv.slice(2);
const usageError = (msg) => {
  console.error(`fonts:fallbacks: ${msg}\n\n${USAGE}`);
  process.exit(2);
};
if (args.includes('-h') || args.includes('--help')) {
  console.log(USAGE);
  process.exit(0);
}
for (let i = 0; i < args.length; i += 2) {
  if (!['--base', '--rounds'].includes(args[i])) usageError(`unknown argument: ${args[i]}`);
  if (args[i + 1] === undefined || args[i + 1].startsWith('--')) usageError(`${args[i]} needs a value`);
}
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const BASE = opt('--base', 'http://localhost:4321');
const ROUNDS = +opt('--rounds', '3');
if (!Number.isInteger(ROUNDS) || ROUNDS < 1) usageError('--rounds needs a whole number of at least 1');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'src/styles/fallbacks.css');
const { chromium } = await import('playwright').catch(() =>
  usageError('the playwright package is not installed (npm i --no-save playwright)'),
);

// the real fonts' hhea metrics (em) and the system fonts that stand in for them (Liberation = Arial/Times/Courier metrics)
const SANS =
  'local("Arial"), local("ArialMT"), local("Liberation Sans"), local("LiberationSans"), local("Arimo"), local("Arimo-Regular")';
const FAM = { 'YL Sans': { src: SANS, asc: 1.0, desc: 0.326, seed: 0.8897 } };
// one-line lists (News, More projects, Awards: .dated.small) are set in the meta role; Experience and Education stay body
const ROLES = {
  name: '.name',
  h2: '.h2',
  title: '.title',
  body: '.bio, .desc, .lead p, .did li, main .dated.xp p:not(.meta), .nf p',
  meta: '.meta, .links, .group, .site-header nav a, .motion, main .dated.small > li > p',
  date: '.date',
};

const faceName = (fam, role) => `${fam} ${role[0].toUpperCase()}${role.slice(1)} Fallback`;
const current = () => {
  const m = {};
  if (!existsSync(OUT)) return m;
  for (const x of readFileSync(OUT, 'utf8').matchAll(/font-family: "([^"]+)";[^}]*?size-adjust: ([\d.]+)%/g))
    m[x[1]] = +x[2] / 100;
  return m;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });

/** The homepage and every project page it links to, in homepage order. */
async function pages() {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const projects = await p.$$eval('.projects h3 a', (as) => as.map((a) => new URL(a.href).pathname));
  await ctx.close();
  if (!projects.length) throw new Error(`${BASE}/ lists no projects (.projects h3 a): is --base the site?`);
  return ['/', ...projects];
}
const PAGES = await pages();

/* global document, getComputedStyle -- the page.evaluate() callback below runs in the browser */
async function measure(width, roles) {
  const acc = {};
  for (const path of PAGES) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    const r = await p.evaluate(
      async ([ROLES, roles]) => {
        await document.fonts.ready;
        const res = {};
        for (const role of roles)
          for (const e of document.querySelectorAll(ROLES[role])) {
            const cs = getComputedStyle(e);
            if (cs.display === 'none' || !e.textContent.trim()) continue;
            const fams = cs.fontFamily.split(',').map((x) => x.trim().replace(/"/g, ''));
            const m = (fam) => {
              const c = document.createElement('span');
              c.style.cssText = `font-family:"${fam}";font-size:${cs.fontSize};font-weight:${cs.fontWeight};letter-spacing:${cs.letterSpacing};word-spacing:${cs.wordSpacing};text-transform:${cs.textTransform};white-space:nowrap;position:absolute;font-variant-numeric:${cs.fontVariantNumeric}`;
              c.textContent = e.textContent.replace(/\s+/g, ' ').trim();
              document.body.append(c);
              const x = c.getBoundingClientRect().width;
              c.remove();
              return x;
            };
            const t = (res[role] ??= { fam: fams[0], fb: fams[1], real: 0, fall: 0, n: 0 });
            t.real += m(fams[0]);
            t.fall += m(fams[1]);
            t.n++;
          }
        return res;
      },
      [ROLES, roles],
    );
    for (const [k, v] of Object.entries(r)) {
      const t = (acc[k] ??= { ...v, real: 0, fall: 0, n: 0 });
      t.real += v.real;
      t.fall += v.fall;
      t.n += v.n;
    }
    await ctx.close();
  }
  return acc;
}

let report;
for (let round = 1; round <= ROUNDS; round++) {
  const cur = current();
  const faces = {};
  report = [];
  {
    const acc = await measure(1440, Object.keys(ROLES));
    for (const [role, v] of Object.entries(acc)) {
      const name = faceName(v.fam, role);
      const ratio = v.real / v.fall;
      const sa = (cur[v.fb] ?? FAM[v.fam].seed) * ratio; // the fallback measured was v.fb at its current size-adjust
      faces[name] = { fam: v.fam, sa };
      report.push({
        role,
        face: name,
        measuredAgainst: v.fb,
        strings: v.n,
        ratio: +ratio.toFixed(4),
        sizeAdjust: +(sa * 100).toFixed(2),
      });
    }
  }
  let css = `/* GENERATED by scripts/fonts/fallbacks.mjs (round ${round}/${ROUNDS}): one metric-matched local fallback per type role.\n   size-adjust = mean width of the real face ÷ fallback over every string of that role on every page; ascent/descent =\n   the real font's hhea ÷ size-adjust (line boxes never change when the real font swaps in). */\n`;
  for (const [name, f] of Object.entries(faces).sort()) {
    const F = FAM[f.fam];
    css += `@font-face { font-family: "${name}"; src: ${F.src}; size-adjust: ${(f.sa * 100).toFixed(2)}%; ascent-override: ${((F.asc / f.sa) * 100).toFixed(2)}%; descent-override: ${((F.desc / f.sa) * 100).toFixed(2)}%; line-gap-override: 0%; }\n`;
  }
  writeFileSync(OUT, css);
  console.log(`round ${round}`);
  console.table(report);
  if (round < ROUNDS)
    execSync('npx astro build', { cwd: ROOT, stdio: 'ignore', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } });
}
await browser.close();
