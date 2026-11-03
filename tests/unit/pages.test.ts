// The pages, rendered with Astro's container API from the entries each test supplies.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import astroConfig from '../../astro.config.mjs';
import Home from '@/pages/index.astro';
import * as ProjectPage from '@/pages/[slug].astro';
import { escapeHtml } from '@/lib/rich-text';
import { list } from '@/lib/list-loader';
import { load, ROOT, schemaOf, type Entry } from './load';

const entries = vi.hoisted(() => new Map<string, unknown[]>());
vi.mock('astro:content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('astro:content')>()),
  getCollection: async (name: string) => entries.get(name) ?? [],
}));
beforeEach(() => entries.clear());

async function render(page: Parameters<AstroContainer['renderToString']>[0], path = '/') {
  const container = await AstroContainer.create({ astroConfig });
  return container.renderToString(page, { request: new Request(new URL(path, astroConfig.site)) });
}

describe('homepage', () => {
  it('renders every education item, in file order', async () => {
    const path = 'tests/unit/fixtures/education.yaml';
    const items: Entry['data'][] = parse(readFileSync(new URL(path, ROOT), 'utf8'));
    const loaded = await load(list(path), schemaOf('education'));
    // the content store does not keep the file order
    entries.set('education', loaded.entries.reverse());

    const html = await render(Home);
    const section = /<section[^>]*id="education"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
    const rows = section.match(/<li\b[\s\S]*?<\/li>/g) ?? [];
    expect(rows).toHaveLength(items.length);
    rows.forEach((row, i) => {
      expect(row).toContain(`<h3 class="title">${escapeHtml(String(items[i]!.org))}</h3>`);
      expect(row).toContain(escapeHtml(String(items[i]!.dateText)));
    });
  });
});

describe('project pages', () => {
  // a project named after the source of a redirect would take its URL
  const redirects = Object.keys(astroConfig.redirects ?? {}).map((source) => source.replace(/^\/|\/$/g, ''));

  it.each(redirects)('a project named "%s" stops the build', async (slug) => {
    entries.set('projects', [{ id: slug, data: { order: 1 } }]);
    await expect(ProjectPage.getStaticPaths()).rejects.toThrow(`the slug "${slug}" shadows`);
  });
});
