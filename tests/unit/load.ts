// Runs a content collection's loader as `astro sync` does, into an in-memory store, validating each entry with the
// collection's schema. The tests use it instead of getCollection(), which reads the data store of the last sync.
import type { AstroConfig } from 'astro';
import type { Loader, LoaderContext } from 'astro/loaders';
import type { z } from 'astro/zod';
import astroConfig from '../../astro.config.mjs';
import { collections } from '@/content.config';

/** The repository root, which Astro's loaders resolve file paths against. */
export const ROOT = new URL('../../', import.meta.url);

export type CollectionName = keyof typeof collections;

export interface Entry {
  id: string;
  data: Record<string, unknown>;
}

export interface Loaded {
  /** The stored entries, in the order the loader stored them. */
  entries: Entry[];
  /** The files the loader read, as absolute paths. */
  files: string[];
  /** The errors and warnings the loader logged. */
  logged: string[];
}

/** A collection's Zod schema (every collection of the site has one, as a plain schema). */
export function schemaOf(name: CollectionName): z.ZodType {
  const { schema } = collections[name];
  if (!schema || typeof schema === 'function') throw new Error(`collection ${name}: no plain schema`);
  return schema;
}

/** A collection's loader. */
export function loaderOf(name: CollectionName): Loader {
  const config = collections[name];
  if (!('loader' in config) || typeof config.loader !== 'object') throw new Error(`collection ${name}: no loader`);
  return config.loader as Loader;
}

/** Runs `loader` with the site's config (`prerenderConflictBehavior` may be overridden) and `schema`. */
export async function load(
  loader: Loader,
  schema: z.ZodType,
  prerenderConflictBehavior = astroConfig.prerenderConflictBehavior,
): Promise<Loaded> {
  const store = new Map<string, Entry>();
  const files: string[] = [];
  const logged: string[] = [];
  const context = {
    collection: 'test',
    store: {
      keys: () => [...store.keys()],
      values: () => [...store.values()],
      entries: () => [...store.entries()],
      get: (id: string) => store.get(id),
      has: (id: string) => store.has(id),
      set: (entry: Entry) => {
        store.set(entry.id, entry);
        return true;
      },
      delete: (id: string) => store.delete(id),
      clear: () => store.clear(),
      addModuleImport: () => {},
    },
    logger: {
      error: (message: string) => logged.push(message),
      warn: (message: string) => logged.push(message),
      info: () => {},
      debug: () => {},
    },
    config: { root: ROOT, prerenderConflictBehavior } as AstroConfig,
    parseData: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const result = await schema.safeParseAsync(data);
      if (!result.success) throw new Error(`${id}: ${result.error.message}`);
      return result.data;
    },
    watcher: { add: (path: string) => files.push(path), on: () => {} },
  } as unknown as LoaderContext;
  await loader.load(context);
  return { entries: [...store.values()], files, logged };
}
