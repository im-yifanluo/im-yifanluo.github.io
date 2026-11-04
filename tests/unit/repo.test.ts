// Rules for the repository as a whole: what it tracks, its size budgets, and the invariants that span files.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import astroConfig from '../../astro.config.mjs';
import budgets from '../../scripts/budgets.json';
import { collections } from '@/content.config';
import { REDIRECT_SOURCES, RESERVED } from '@/lib/routes';
import { load, loaderOf, ROOT, schemaOf, type CollectionName } from './load';

const at = (path: string) => new URL(path, ROOT);
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);

// the website's sources, its configuration and its one document
const TOP_LEVEL = [
  '.github',
  'public',
  'scripts',
  'src',
  'tests',
  '.editorconfig',
  '.gitignore',
  '.nvmrc',
  '.prettierignore',
  '.prettierrc.json',
  'astro.config.mjs',
  'eslint.config.js',
  'playwright.config.ts',
  'tsconfig.json',
  'vitest.config.ts',
  'LICENSE',
  'README.md',
  'package.json',
  'package-lock.json',
];

describe('tracked files', () => {
  it('sit under the expected top-level entries', () => {
    const top = new Set(tracked.map((path) => path.split('/')[0]!));
    expect([...top].filter((entry) => !TOP_LEVEL.includes(entry))).toEqual([]);
  });

  it('include no Markdown but the README', () => {
    expect(tracked.filter((path) => /\.(md|markdown|mdx)$/i.test(path))).toEqual(['README.md']);
  });
});

describe('budgets', () => {
  const size = (path: string) => statSync(at(path)).size;

  it('trackedBytes: all tracked files together', () => {
    expect(tracked.reduce((total, path) => total + size(path), 0)).toBeLessThanOrEqual(budgets.trackedBytes.max);
  });

  it('publicFileBytes: each file in public/', () => {
    const over = tracked.filter((path) => path.startsWith('public/') && size(path) > budgets.publicFileBytes.max);
    expect(over).toEqual([]);
  });

  it('every "repo" budget is checked here', () => {
    const repo = Object.entries(budgets).filter(([, budget]) => typeof budget === 'object' && budget.scope === 'repo');
    expect(repo.map(([key]) => key)).toEqual(['trackedBytes']);
  });
});

describe('project slugs', () => {
  const redirects = Object.keys(astroConfig.redirects ?? {}).map((source) => source.replace(/^\/|\/$/g, ''));
  const slugs = readdirSync(at('src/content/projects/'))
    .filter((file) => file.endsWith('.yaml'))
    .map((file) => file.slice(0, -'.yaml'.length));

  it('none is reserved or the source of a redirect', () => {
    expect(slugs.length).toBeGreaterThan(0);
    expect(slugs.filter((slug) => RESERVED.includes(slug) || redirects.includes(slug))).toEqual([]);
  });

  it('REDIRECT_SOURCES are the sources of the redirects in astro.config.mjs', () => {
    expect(REDIRECT_SOURCES.toSorted()).toEqual(redirects.toSorted());
  });

  it('RESERVED includes every folder in public/', () => {
    const folders = new Set(tracked.filter((path) => /^public\/[^/]+\//.test(path)).map((path) => path.split('/')[1]!));
    expect([...folders].filter((folder) => !RESERVED.includes(folder))).toEqual([]);
  });
});

describe('lists', () => {
  const lists = (Object.keys(collections) as CollectionName[]).filter((name) => loaderOf(name).name === 'list-loader');

  it.each(lists)('%s loads every item of its file, each under its own id', async (name) => {
    const { entries, files } = await load(loaderOf(name), schemaOf(name));
    expect(files).toHaveLength(1);
    const ids = (parse(readFileSync(files[0]!, 'utf8')) as { id: unknown }[]).map((item) => String(item.id));
    expect(entries).toHaveLength(ids.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(entries.map((entry) => entry.id).toSorted()).toEqual(ids.toSorted());
  });

  it('every YAML file in src/data is a list', async () => {
    const loaded = await Promise.all(lists.map(async (name) => (await load(loaderOf(name), schemaOf(name))).files));
    const data = readdirSync(at('src/data/'))
      .filter((file) => /\.ya?ml$/.test(file))
      .map((file) => fileURLToPath(at(`src/data/${file}`)));
    expect(loaded.flat().toSorted()).toEqual(data.toSorted());
  });

  it('News is newest first', async () => {
    const { entries } = await load(loaderOf('news'), schemaOf('news'));
    const dates = entries
      .map(({ data }) => data as { position: number; date: string })
      .toSorted((a, b) => a.position - b.position)
      .map(({ date }) => date);
    expect(dates).toEqual(dates.toSorted().reverse());
  });
});
