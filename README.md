# Yifan Luo

Personal website: projects, experience, news and awards. Its address is <https://im-yifanluo.github.io>, the default
`SITE_URL` of the build.

## Stack

- [Astro](https://astro.build) 7, static output, no UI framework.
- Hand-written CSS: design tokens and global stylesheets in `src/styles/`.
- Content in YAML, validated by Astro content collections.
- One self-hosted font (a Source Sans 3 subset), inlined into each page's CSS, with metric-matched fallbacks.
- Built for GitHub Pages: static files served from the domain root.
- A sitemap of every page (`sitemap-index.xml`, written by `@astrojs/sitemap`) and a `robots.txt` that names it.

## Commands

Requires Node 24 (see `.nvmrc`; 22.19 or later builds the site, and `npm run lint` needs 22.22.3 or 24.16 or later). Run
everything from the repository root.

| Command                             | What it does                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                            | Install the exact dependency versions from `package-lock.json`                                                      |
| `npm run dev`                       | Start the dev server at `http://localhost:4321`                                                                     |
| `npm run build`                     | `astro check`, then `astro build` into `dist/`, then the post-build checks                                          |
| `npm run preview`                   | Serve the built `dist/` locally                                                                                     |
| `npm run check`                     | Type-check `.astro` and `.ts` files and validate the content against its schema                                     |
| `npm run astro -- …`                | Run any Astro CLI command, e.g. `npm run astro -- add` or `npm run astro -- telemetry disable`                      |
| `npm run check:dist`                | Run the post-build checks again on an existing `dist/`                                                              |
| `npm run check:links`               | Report broken external links in `dist/` (needs the network; never fails the build)                                  |
| `npm run lint`                      | Lint the code with ESLint, including accessibility rules for `.astro` templates                                     |
| `npm run format`                    | Format the code with Prettier                                                                                       |
| `npm run format:check`              | Check the formatting without changing files                                                                         |
| `npm test`                          | Run the unit tests (see [Tests](#tests))                                                                            |
| `npm run test:e2e`                  | Run the end-to-end tests on the built site (see [Tests](#tests))                                                    |
| `npm run media`                     | Rebuild the web media from `$MEDIA_SRC`; `npm run media -- --only <job>` for one job, `-- --help` for the job names |
| `npm run media:portrait -- <photo>` | Rebuild the homepage portrait from a photo                                                                          |
| `npm run fonts:fallbacks`           | Re-tune the fallback font faces in `src/styles/fallbacks.css`                                                       |

## Project structure

```
.github/                   workflows/ci.yml (checks), workflows/deploy.yml (GitHub Pages), dependabot.yml
public/                    copied into dist/ as is
├── media/                 web-ready images and video loops (written by npm run media)
├── fonts/OFL.txt          the font's license, served at /fonts/OFL.txt
├── og.jpg                 the link preview, 1200 × 630 (written by npm run media)
└── favicon.svg  apple-touch-icon.png  yifan-luo-resume.pdf
scripts/
├── check-dist.mjs         post-build checks, run by npm run build
├── budgets.json           size and performance budgets
├── site-url.mjs           the site URL: SITE_URL, else the default
├── privacy-scan.mjs       privacy scan of dist/ (or any files)
├── privacy-allow.json     exceptions to the privacy scan, each with a reason
├── media/                 build.mjs, jobs/<job>.mjs, lib.mjs (shared helpers), portrait.mjs, paths.mjs (settings)
└── fonts/                 fallbacks.mjs
src/
├── assets/fonts/          yl-sans.woff2, inlined into the CSS at build time
├── components/            RichText, LinkList, Media, PosterBox, PauseVideos, Caption, AwardGroup, OrderStrip, diagrams/
├── content/projects/      one YAML file per project
├── data/                  news, awards, experience, education, more-projects (YAML); diagrams.ts
├── generated/             media.json, portrait.json, font.json: written by scripts or exported once; never edited by hand
├── layouts/               BaseLayout.astro
├── lib/                   dates, rich text, typography, the YAML list loader, reserved paths, media manifests, diagrams
├── pages/                 index.astro, [slug].astro, 404.astro, robots.txt.ts
├── scripts/               the page script (header, separators, print, poster fades, loops), inlined into each page
├── styles/                tokens, global, fonts, fallbacks, diagrams
├── content.config.ts      the content schema
├── env.d.ts               HTML attributes that Astro's types do not declare
└── site.config.ts         name, contact links, intro, last-updated date, typography settings
tests/
├── unit/                  unit tests (Vitest); fixtures/ holds the YAML files they load
└── e2e/                   end-to-end tests (Playwright): *.spec.ts, fixtures.ts (shared setup), helpers/
astro.config.mjs           site URL, static build, the sitemap, redirects for renamed pages
.prettierrc.json           Prettier settings; .prettierignore skips the generated and served-as-is files
eslint.config.js           ESLint rules: JavaScript, TypeScript, Astro and accessibility
vitest.config.ts           Vitest settings, on top of Astro's Vite config
playwright.config.ts       Playwright settings: the desktop and phone projects, the preview server for the tests
```

## Editing content

The exact field names and types are defined in `src/content.config.ts`; `npm run check` reports anything that does not
match.

**Projects.** Each project is one file, `src/content/projects/<slug>.yaml`, and is published at `/<slug>/`.

- `order` sets its place on the homepage and the previous/next links between project pages. Give a new project the
  next free number.
- The header: `title`, `short` (the browser tab and the previous/next links), `role`, `org`, `start` and `end`
  (`YYYY-MM`, or `present`), `roleLine` (the project page's meta line, without dates), `award`, and `outcome` (the
  homepage line and the page description).
- The page: `lead`, then `did` (a list), or `didGroups` (titled groups, each with its own `did`), then `figures`,
  `builtWith` and `credits`.
- Media: `hero` and each media figure name an entry and its part in `src/generated/media.json`, as `media` (the key),
  `part` (`tile`, `hero` or `figure`) and `alt`. The optional `tile` takes `media` and `part` only: a tile is
  decorative, since the row's title link names the project. The hero and figures also take a `caption` and an optional
  `captionPhone`, and figures a `width` (`wide` or `text`). Without `tile`, the homepage uses the `tile` part of the
  entry named after the slug. Add the project's media job first, run it alone with `npm run media -- --only <job>`,
  then refer to the new key. Instead of a media entry, `hero` and `tile` may be `drawn: order-strip`, the strip drawn
  in HTML and SVG by `src/components/OrderStrip.astro` (the hero still takes a `caption`).
- A figure can also be a diagram, `diagram: <id>`, with an id defined in `src/data/diagrams.ts`.
- `links` use a fixed set of labels: `App Store`, `Google Play`, `Website` and `Code`.
- A slug must not shadow a top-level path of the site or the source of a redirect (both listed in
  `src/lib/routes.ts`); the build stops if it does.

**Lists.** News, awards, experience, education and smaller projects live in `src/data/*.yaml`, one list per file.

- Every item needs an `id` that is unique within its file. A missing or repeated id, or a YAML error, stops
  `npm run check` and the build, naming the file.
- The order in the file is the order on the page. News is newest first.
- News and smaller projects are `date` and `text`. A News `date` is a month (`YYYY-MM`), since the footer's "Last
  updated" is the newest one; smaller projects and awards may also use a year (`YYYY`) or a span of years (`YYYY–YY`).
- Experience is `start`, `end` (`YYYY-MM`, or `present`), `org`, `role` and `lines`. Education is `graduation`
  (`YYYY-MM`), `dateText` (shown after the month, e.g. `(expected)`), `org`, `role` and `lines`.
- Awards are groups with a `label`, `items` (each a `date` and `text`) and `collapsed: true` for the groups that sit
  behind the "Show all" control.

**Site-wide text.** Name and description (`SITE`), contact links (`EMAIL`, `RESUME`, `GITHUB`, `LINKEDIN`), the
homepage intro (`INTRO`) and the date of the last content revision (`REVISED`) are in `src/site.config.ts`.

**Inline markup.** The text fields that render as copy (titles, `short`, `role`/`roleLine` items, `award`, `outcome`,
`lead`, `did`, captions, `credits`, `builtWith`, the `text` and `lines` of every list, the intro, and the strings in
`src/data/diagrams.ts`) may use:

- `[label](https://example.com)` for a link;
- `` `code` `` for code;
- plain text for everything else (no HTML).

`short` sits inside the previous/next links, so it takes `code` but no link. The browser tab (`short`) and the page
description (`outcome`) show plain text: the markup is dropped and the typography kept.

The other fields are shown exactly as written, without markup: a `didGroups` label, an awards group's `label`, `org`
in experience and education, education's `dateText`, link labels and every `alt`.

Write straight quotes; curly quotes and non-breaking spaces are applied when the site is built. Phrases that must
never break across a line (names, product names, dates) are listed under `TYPOGRAPHY` in `src/site.config.ts`.

## Media and fonts

### Media

Source footage and full-size images are not in git. They live in a separate folder, `$MEDIA_SRC` (default
`../portfolio-media`, next to this repository): private masters, which are not published with this repository. It has
one subfolder per media job, and its `README.md` lists each job's inputs and where they came from. The media scripts
read from it and write web-ready files into the repository:

| Script                              | Writes                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run media`                     | `public/media/*` (AVIF and WebP stills, H.264 MP4 and AV1 WebM loops), `src/generated/media.json`, and `public/og.jpg` |
| `npm run media:portrait -- <photo>` | `public/media/portrait-*` and `src/generated/portrait.json`                                                            |

Settings, all optional (`scripts/media/paths.mjs`):

- `MEDIA_SRC`: source folder (default `../portfolio-media`);
- `MEDIA_CACHE`: lossless masters and other intermediate files (default `$MEDIA_SRC/.cache`);
- `MEDIA_OUT`: output folder (default `public/media`);
- `OG_OUT`: the link preview (default `public/og.jpg`);
- `FFMPEG`, `FFPROBE`: binaries to use (default: from `PATH`). ffmpeg needs `libx264` and `libsvtav1`. The privacy
  scan uses `FFPROBE` too (see [Checks](#checks)).

Each job is an entry in the `jobs` object in `scripts/media/build.mjs`, written there or imported from
`scripts/media/jobs/<job>.mjs`. It writes its files and returns its manifest entry (`MediaEntry` in
`src/lib/media.ts`), which `npm run media` stores under the job's name in `src/generated/media.json`.

The jobs run in a fixed order. The `og` job cuts the 1200 × 630 link preview from the Framelight hero, an intermediate
that the `framelight` job writes to `MEDIA_CACHE`, so it runs after `framelight` with the same cache
(`npm run media -- --only framelight,og`).

A clone builds and serves the site from the committed files alone (`public/media`, `public/og.jpg`, `src/generated`
and `src/assets/fonts`); only regenerating media or the font subset needs `$MEDIA_SRC`.

Size budgets are defined once, in `scripts/budgets.json`, and checked on every build (`npm run media` encodes the loops
to fit them): each tile loop at most 400 KiB (640 KiB for its high-density rendition), each hero loop at most 1 MiB, no
single file over 1 MiB, and each page at most 128 KiB of HTML, 64 KiB of it inline CSS (the inlined font included).
`npm test` checks the repository's own budget: at most 30 MiB of tracked files.

`public/favicon.svg` and `public/apple-touch-icon.png` (180 × 180) are made by hand; no script writes them.
`public/yifan-luo-resume.pdf` is served as is.

### Fonts

The site uses one font, `src/assets/fonts/yl-sans.woff2`: a subset of
[Source Sans 3](https://github.com/adobe-fonts/source-sans), renamed YL Sans as the SIL Open Font License requires for
modified versions. It is committed as built. `src/styles/fonts.css` points at it, and the build inlines it into each
page's CSS as a `data:` URI (`astro.config.mjs` inlines only the font and the page script), so a page makes no font
request. The license is served at `/fonts/OFL.txt`. `src/generated/font.json` records the file's hash and the code
points it covers. Text that needs a character outside the subset requires rebuilding the subset; the build does not
check for one. The subset generator is not in this repository: `$MEDIA_SRC/fonts/README.md` says where it is, with its
sources and settings.

`npm run fonts:fallbacks` measures the real font against local system fonts for each text role and writes
`src/styles/fallbacks.css`, so that text laid out in a fallback face takes the same space and the page does not shift
if it is ever painted before the font. It runs headless and needs:

- a server for the site (`-- --base <url>`, default `http://localhost:4321`): `npm run dev`, or `npm run preview`
  after a build (the script rebuilds `dist/` between its rounds);
- Chrome installed on the machine, since the script launches it through Playwright's `chrome` channel (Playwright's
  bundled Chromium is not used).

## Checks

`npm run build` runs three steps and stops at the first failure:

1. `astro check`: types, and the content against `src/content.config.ts`.
2. `astro build`: the static site into `dist/`.
3. `node scripts/check-dist.mjs` on `dist/`:
   - only expected files are present (pages, media, the font license, bundled scripts, the sitemap, `robots.txt`, the
     named root files; no data or report files);
   - no local URLs (`localhost`, `127.0.0.1`, `file:`) anywhere, and every canonical and Open Graph URL is absolute on
     `SITE_URL` (default `https://im-yifanluo.github.io`) and names a page or file in `dist/`;
   - every URL in the sitemap and in `robots.txt` (which names the sitemap) is absolute on `SITE_URL` too and names a
     file in `dist/`, and the sitemap lists exactly the pages without a `noindex` robots tag (all but the 404 page and
     redirect pages);
   - the `dist` budgets in `scripts/budgets.json`;
   - the privacy scan (below).

Set `SITE_URL` when building for a different domain; `astro.config.mjs` and the checks both read it through
`scripts/site-url.mjs`. Exit codes: 0 pass, 1 a failed check, 2 a setup error (bad arguments, or a privacy scan that
could not run to the end).

### Privacy scan

`scripts/privacy-scan.mjs` scans every built file, including image, PDF and video metadata, for personal data and
secrets that should not be published. Its generic rules are in the script. Private values and additional private rules
are loaded at run time and never committed:

- from the environment variables `PRIVACY_SCAN_PRIVATE` and `PRIVACY_SCAN_RULES`, if set;
- else from the files `PRIVACY_SCAN_PRIVATE_FILE` and `PRIVACY_SCAN_RULES_FILE` name, by default
  `~/.config/portfolio-website/privacy-private-values.txt` and `~/.config/portfolio-website/privacy-rules.json` (keep
  both at mode 600).

The values file holds one entry per line (`phone:…`, `email:…` or `literal:…`); in `PRIVACY_SCAN_PRIVATE` a comma also
separates entries. An entry that is not what its type says is rejected and reported by its position, never by its
value.

If the private data is missing (the values need at least one `phone:` entry) or an entry is rejected, the build prints
a warning and continues; with `CI` or `PRIVACY_STRICT=1` set, the build fails instead.

Video metadata is read with ffprobe: `FFPROBE`, else `ffprobe` on `PATH` (it comes with ffmpeg). Without it, a local
build reads video tags from the raw bytes, which still catches location boxes and coordinates, and prints a warning;
with `CI` or `PRIVACY_STRICT=1` set, or with `--strict`, every video counts as unscannable and the scan fails. A video
ffprobe cannot read always fails the scan.

Files are recognized by their content rather than their name, so a renamed image still has its metadata checked. A
file whose content does not match its extension fails the scan.

Exceptions to the generic rules go in `scripts/privacy-allow.json`, each with a reason.

The same scanner checks source files too, for example everything tracked (with ffprobe available, since `--strict`
requires it):

```sh
git ls-files -z | xargs -0 node scripts/privacy-scan.mjs --strict
```

## Tests

Both suites take their expectations from the content, `src/site.config.ts` and `scripts/budgets.json` rather than from
copied values, so a content edit needs no test change unless it breaks a rule.

**Unit tests** (`npm test`, [Vitest](https://vitest.dev), `tests/unit/`) run on Astro's Vite config and need no build.
They cover the text helpers in `src/lib/`, the diagram edge geometry, the content schemas and the list loader, the
homepage and `robots.txt` rendered with Astro's container API, and rules for the repository as a whole (tracked files,
size budgets, unique list ids, reserved slugs).

**End-to-end tests** (`npm run test:e2e`, [Playwright](https://playwright.dev), `tests/e2e/`) drive a headless browser
against the built site, which `astro preview` serves at `http://127.0.0.1:4329`. They never build:

```sh
npm run build
npx playwright install chromium   # once; or run with PW_CHANNEL=chrome to use the installed Chrome
npm run test:e2e
```

- They open the homepage, each project page it links to and the 404 page at seven widths, split between two
  Playwright projects: `desktop` (1440, 1280, 1024 and 768 px) and `phone` (390, 360 and 320 px, with touch).
- Tags: `@desktop` and `@phone` tests run in that project only. `@local` tests (measured layout and type, throttled
  loading) depend on the machine's fonts and speed, and are skipped when `CI` is set.
- `E2E_PORT` changes the port. Arguments after `--` go to Playwright, e.g. `npm run test:e2e -- tests/e2e/seo.spec.ts`.
- Reports go to `playwright-report/` (`npx playwright show-report`) and traces of failed tests to `test-results/`.

One spec per concern: `layout`, `typography`, `chrome` (header and footer), `interaction`, `awards`, `a11y`, `media`,
`performance`, `links`, `seo`, `diagrams` and `no-js`. Each file opens with a comment that says what it checks.

## CI and deployment

`.github/workflows/ci.yml` runs `format:check`, `lint`, `build`, `test` and `test:e2e` (without `@local`) on every pull
request and push to `main`. `.github/workflows/deploy.yml` publishes to GitHub Pages and runs only when started by hand
(Actions → Deploy → Run workflow; Settings → Pages → Source: GitHub Actions).

- Secrets: `PRIVACY_SCAN_PRIVATE` and `PRIVACY_SCAN_RULES`, the contents of the two files in
  [Privacy scan](#privacy-scan). Add both as Actions secrets and as Dependabot secrets: a CI build fails without them,
  and Dependabot's pull requests see only Dependabot secrets.
- Variable: `SITE_URL`, the deployed address (default `https://im-yifanluo.github.io`).
- Dependabot: npm weekly (minor and patch dev updates grouped), Actions monthly.

## License

- **Code** (everything that is not listed below): MIT, see [`LICENSE`](LICENSE).
- **Text, photos, videos and other media**, including the résumé and the content in `src/content`, `src/data` and
  `public/media`: © Yifan Luo and collaborators, all rights reserved. They are not covered by the MIT license.
- **Font**: `src/assets/fonts/yl-sans.woff2`, inlined into the built pages, is licensed under the SIL Open Font
  License 1.1, see [`public/fonts/OFL.txt`](public/fonts/OFL.txt).
