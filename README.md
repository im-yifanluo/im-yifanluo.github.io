# Yifan Luo

Personal website: projects, experience, news and awards, live at <https://yifanluo.dev>. A static
[Astro](https://astro.build) 7 site with no UI framework, hand-written CSS and YAML content, deployed to GitHub Pages.

## Getting started

Requires Node 24 (`.nvmrc`). A clone builds from the committed files alone; only regenerating the media or the font
needs the private source files (see [Media and fonts](#media-and-fonts)).

```sh
npm ci
npm run dev   # http://localhost:4321
```

## Commands

| Command                             | What it does                                                               |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `npm run dev`                       | Start the dev server                                                       |
| `npm run build`                     | `astro check`, then `astro build` into `dist/`, then the post-build checks |
| `npm run preview`                   | Serve the built `dist/`                                                    |
| `npm run check`                     | Type-check the code and validate the content against its schema            |
| `npm run check:dist`                | Run the post-build checks again on an existing `dist/`                     |
| `npm run check:links`               | Report broken external links in `dist/` (needs the network; never fails)   |
| `npm run lint`                      | Lint with ESLint, including accessibility rules for `.astro` files         |
| `npm run format`                    | Format with Prettier (`npm run format:check` only checks)                  |
| `npm test`                          | Run the unit tests                                                         |
| `npm run test:e2e`                  | Run the end-to-end tests on the built site                                 |
| `npm run media`                     | Rebuild the web media from `$MEDIA_SRC` (`-- --only <job>` for one job)    |
| `npm run media:portrait -- <photo>` | Rebuild the homepage portrait from a photo                                 |
| `npm run fonts:fallbacks`           | Re-tune the fallback font faces in `src/styles/fallbacks.css`              |
| `npm run astro -- …`                | Run any Astro CLI command                                                  |

The command-line scripts in `scripts/` print their options with `--help`, e.g. `npm run media -- --help`.

## Project structure

```text
.github/                CI, the GitHub Pages deploy, Dependabot
public/                 copied into dist/ as is: media/ and og.jpg (generated), icons, the résumé, fonts/OFL.txt
scripts/                check-dist.mjs (post-build checks), privacy-scan.mjs and privacy-allow.json, budgets.json,
                        site-url.mjs, media/ (the media pipeline; settings in paths.mjs), fonts/ (fallbacks.mjs)
src/
├── content/projects/   one YAML file per project
├── data/               news, awards, experience, education, more projects (YAML lists); diagrams.ts
├── site.config.ts      name, contact links, intro, last revision date, typography settings
├── content.config.ts   the content schema
├── pages/              homepage, project pages ([slug]), 404, robots.txt
├── layouts/            BaseLayout.astro
├── components/         RichText, LinkList, Media, PosterBox, PauseVideos, Caption, AwardGroup, OrderStrip, diagrams/
├── scripts/            the page script (header, separators, print, poster fades, loops), inlined into each page
├── lib/                dates, rich text, typography, the list loader, routes, media manifests, diagrams, summaries
├── styles/             tokens, global, fonts, fallbacks, diagrams
├── assets/fonts/       yl-sans.woff2, inlined into each page's CSS
└── generated/          media.json, portrait.json, font.json: written by tools, never edited by hand
tests/                  unit/ (Vitest) and e2e/ (Playwright)
astro.config.mjs        site URL, sitemap, redirects
```

## Editing content

Field names and types are in [`src/content.config.ts`](src/content.config.ts); `npm run check` reports anything that
does not match.

To add a project:

1. Add its media job and run it alone with `npm run media -- --only <job>` (see [Media and fonts](#media-and-fonts)).
2. Create `src/content/projects/<slug>.yaml`, published at `/<slug>/`, with the next free `order` (its place on the
   homepage and in the previous/next links). The slug must not be in `RESERVED` (`src/lib/routes.ts`) or be a redirect
   source in `astro.config.mjs`; the build fails if it is.
3. Point `hero` and the media `figures` at the job's key in `src/generated/media.json` (`media`, `part`, `alt`); without
   `tile`, the homepage uses the entry named after the slug. A figure can also be a diagram, `diagram: <id>` from
   `src/data/diagrams.ts`.

Other content:

- **Lists** (news, awards, experience, education, smaller projects): `src/data/*.yaml`, one list per file. Every item
  needs an `id` unique within its file, and the file order is the page order (News newest first). A News `date` is a
  month (`YYYY-MM`): the footer's "Last updated" is the newer of the newest News month and `REVISED`.
- **Site-wide text** (name, contact links, intro, `REVISED`): `src/site.config.ts`. Its `TYPOGRAPHY` lists the phrases
  that must not break across lines.
- **Copy** may use `[label](https://…)` links and `` `code` ``, never HTML. The fields the schema marks "shown as
  written" (labels, `org` and `dateText` in the lists, `alt`) take no markup. Write straight quotes: curly quotes and
  non-breaking spaces are applied when the site is built.

## Media and fonts

The web media, `public/og.jpg`, the manifests in `src/generated/` and the font are committed as built. Their private
sources are not published: they live in `$MEDIA_SRC` (default `../portfolio-media`), whose `README.md` lists each media
job's inputs and whose `fonts/README.md` says how the font subset is made.

- `npm run media` needs ffmpeg with `libx264` and `libsvtav1`. Its settings (`MEDIA_SRC`, `MEDIA_CACHE`, `MEDIA_OUT`,
  `OG_OUT`, `FFMPEG`, `FFPROBE`) are described in [`scripts/media/paths.mjs`](scripts/media/paths.mjs).
- A job is an entry in `jobs` in `scripts/media/build.mjs` (inline, or from `jobs/<job>.mjs`) that returns its manifest
  entry. The `og` job cuts the link preview from a `framelight` intermediate, so run both:
  `npm run media -- --only framelight,og`.
- Size budgets are defined once, in `scripts/budgets.json`. `npm run media` encodes the loops to fit them; the build and
  the tests check them.
- The font is a subset of [Source Sans 3](https://github.com/adobe-fonts/source-sans), renamed YL Sans as the SIL Open
  Font License requires. `src/generated/font.json` lists the code points it covers; a character outside them needs a
  new subset, and the end-to-end tests report one.
- `npm run fonts:fallbacks` needs Chrome and a running site (`npm run dev`, or `npm run preview` after a build).

## Checks

`npm run build` stops at the first failure. Its last step, `scripts/check-dist.mjs`, checks the files and URLs in
`dist/`, the size budgets and privacy; `node scripts/check-dist.mjs --help` lists every rule.

The privacy scan (`scripts/privacy-scan.mjs`) checks every built file, including image, PDF and video metadata, for
personal data and secrets. Its private rules are never committed: set `PRIVACY_SCAN_PRIVATE` and `PRIVACY_SCAN_RULES`,
or put the files in `~/.config/portfolio-website/` (formats in the script's header). Without them, or without ffprobe,
it warns locally and fails under `CI`, `PRIVACY_STRICT=1` or `--strict`. Exceptions go in `scripts/privacy-allow.json`
with a reason. To scan the tracked sources:

```sh
git ls-files -z | xargs -0 node scripts/privacy-scan.mjs --strict
```

## Tests

Both suites take their expectations from the content, `src/site.config.ts` and `scripts/budgets.json`, so a content
edit needs no test change unless it breaks a rule. Unit tests ([Vitest](https://vitest.dev), `tests/unit/`) need no
build. End-to-end tests ([Playwright](https://playwright.dev), `tests/e2e/`) drive a headless browser against the built
site, served by `astro preview` on port 4329 (`E2E_PORT`), at seven widths in a `desktop` and a `phone` project:

```sh
npm run build
npx playwright install chromium   # once; or set PW_CHANNEL=chrome to use the installed Chrome
npm run test:e2e                  # arguments after -- go to Playwright
```

Tests tagged `@desktop` or `@phone` run in that project only. Tests tagged `@local` (measured layout and type, throttled
loading) depend on the machine's fonts and speed, and are skipped when `CI` is set.

## CI and deployment

[`ci.yml`](.github/workflows/ci.yml) runs `format:check`, `lint`, `build`, `test` and `test:e2e` on every pull request
and push to `main`. [`deploy.yml`](.github/workflows/deploy.yml) publishes to GitHub Pages on every push to `main`, or
when started by hand (Actions → Deploy → Run workflow); Settings → Pages: Source "GitHub Actions", custom domain
`yifanluo.dev`.

- Secrets: `PRIVACY_SCAN_PRIVATE` and `PRIVACY_SCAN_RULES`, the privacy scan's private data, as both Actions and
  Dependabot secrets (a CI build fails without them, and Dependabot's pull requests see only Dependabot secrets).
- Variable: `SITE_URL`, the origin the site is served from, at its root (default `https://yifanluo.dev`).

## License

- **Code** (everything that is not listed below): MIT, see [`LICENSE`](LICENSE).
- **Text, photos, videos and other media**, including the résumé and the content in `src/content`, `src/data` and
  `public/media`: © Yifan Luo and collaborators, all rights reserved. They are not covered by the MIT license.
- **Font**: `src/assets/fonts/yl-sans.woff2`, inlined into the built pages, is licensed under the SIL Open Font
  License 1.1, see [`public/fonts/OFL.txt`](public/fonts/OFL.txt).
