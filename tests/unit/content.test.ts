// The content schemas and the list loader: what `npm run check` and the build reject.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { DIAGRAMS } from '@/data/diagrams';
import { diagram } from '@/lib/diagrams';
import { list } from '@/lib/list-loader';
import { MEDIA, mediaPart } from '@/lib/media';
import { load, loaderOf, ROOT, schemaOf, type CollectionName } from './load';

const readYaml = (path: string) => parse(readFileSync(new URL(path, ROOT), 'utf8'));

const PROJECTS_DIR = 'src/content/projects/';
const projects = readdirSync(new URL(PROJECTS_DIR, ROOT))
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => readYaml(PROJECTS_DIR + f));

// keys that every object inherits: never a media entry or a diagram
const INHERITED = ['constructor', 'toString', '__proto__'];

describe('month fields', () => {
  const NOT_A_MONTH = ['2026-00', '2026-13', '2026-1', '2026', '2024–25', 'May 2026'];

  it.each([
    ['news', 'date'],
    ['experience', 'start'],
    ['experience', 'end'],
    ['education', 'graduation'],
  ] satisfies [CollectionName, string][])('%s %s is YYYY-MM with a month of 01-12', async (name, field) => {
    const schema = schemaOf(name);
    const [first] = (await load(loaderOf(name), schema)).entries;
    const accepts = (value: string) => schema.safeParse({ ...first!.data, [field]: value }).success;
    expect(accepts('2026-01')).toBe(true);
    expect(accepts('2026-12')).toBe(true);
    for (const value of NOT_A_MONTH) expect(accepts(value), value).toBe(false);
  });

  it.each(['start', 'end'])('a project %s is YYYY-MM with a month of 01-12', (field) => {
    const accepts = (value: string) => schemaOf('projects').safeParse({ ...projects[0], [field]: value }).success;
    expect(accepts('2026-01')).toBe(true);
    expect(accepts('2026-12')).toBe(true);
    for (const value of NOT_A_MONTH) expect(accepts(value), value).toBe(false);
  });
});

describe('media and diagram ids', () => {
  const project = projects.find((p) => 'media' in p.hero);

  it('a project with a media hero passes as it is', () => {
    expect(schemaOf('projects').safeParse(project).success).toBe(true);
  });

  it.each(INHERITED)('the schema rejects the media key "%s"', (key) => {
    const result = schemaOf('projects').safeParse({ ...project, hero: { ...project.hero, media: key } });
    expect(result.error?.message).toContain('not in src/generated/media.json');
  });

  it.each(INHERITED)('the schema rejects the diagram id "%s"', (id) => {
    const result = schemaOf('projects').safeParse({ ...project, figures: [{ diagram: id }] });
    expect(result.error?.message).toContain('unknown diagram id');
  });

  it.each(INHERITED)('mediaPart() and diagram() find nothing under "%s"', (key) => {
    expect(mediaPart({ media: key, part: 'tile' })).toBeUndefined();
    expect(() => diagram(key)).toThrow(`no diagram "${key}"`);
  });

  it('mediaPart() and diagram() find every real entry', () => {
    for (const [key, entry] of Object.entries(MEDIA)) {
      for (const part of ['tile', 'hero', 'figure'] as const) expect(mediaPart({ media: key, part })).toBe(entry[part]);
    }
    for (const [id, spec] of Object.entries(DIAGRAMS)) expect(diagram(id)).toBe(spec);
  });
});

describe('list', () => {
  const fixture = (name: string) => `tests/unit/fixtures/${name}.yaml`;

  it('loads every item, with its place in the file as `position`', async () => {
    const { entries, logged } = await load(list(fixture('education')), schemaOf('education'));
    const items: { id: string }[] = readYaml(fixture('education'));
    expect(logged).toEqual([]);
    expect(entries.map((e) => [e.id, e.data.position])).toEqual(items.map((item, i) => [item.id, i]));
  });

  it.each([
    ['a mapping', 'not-a-list', 'expected a YAML list of items'],
    ['a file without items', 'no-items', 'expected a YAML list of items'],
    ['a missing file', 'missing', 'not found'],
    ['an item without an id', 'missing-id', '2 items, 1 loaded (every item needs a unique id)'],
  ])('stops on %s, naming the file', async (_, name, message) => {
    await expect(load(list(fixture(name)), schemaOf('news'))).rejects.toThrow(`${fixture(name)}: ${message}`);
  });

  it('stops on a YAML error, naming the file and the line', async () => {
    await expect(load(list(fixture('bad-yaml')), schemaOf('news'))).rejects.toThrow(
      new RegExp(`^${fixture('bad-yaml')}: .*line 4`),
    );
  });

  it('stops on a repeated id', async () => {
    // Astro's own loader throws, since astro.config.mjs sets prerenderConflictBehavior: 'error' ...
    await expect(load(list(fixture('duplicate-id')), schemaOf('news'))).rejects.toThrow(
      'multiple entries with the same slug: `same`',
    );
    // ... and without that setting, the item count still catches the overwritten item
    await expect(load(list(fixture('duplicate-id')), schemaOf('news'), 'warn')).rejects.toThrow(
      `${fixture('duplicate-id')}: 2 items, 1 loaded`,
    );
  });
});
