// The loader of the homepage lists (src/data/*.yaml, content.config.ts): Astro's file() loader, made strict.
import { file, type Loader } from 'astro/loaders';
import { parseDocument } from 'yaml';

/** A YAML list, parsed with Astro's own settings (core schema, timestamps, merge keys), with each item's place in the
 *  file as `position`: the content store keeps entries sorted by id, so a page sorts a list by `position`.
 *  Astro's file() loader only logs a file it cannot read or parse, an item without an id and a repeated id, and builds
 *  the section without them; this wrapper stops the build instead, naming the file. */
export function list(path: string): Loader {
  let items: number | undefined;
  let error: unknown;
  const inner = file(path, {
    parser: (text) => {
      try {
        const doc = parseDocument(text, { customTags: ['timestamp'], merge: true, schema: 'core' });
        if (doc.errors.length > 0) throw doc.errors[0];
        const data: unknown = doc.toJS();
        if (!Array.isArray(data)) throw new Error('expected a YAML list of items');
        items = data.length;
        return data.map((item: Record<string, unknown>, position) => ({ ...item, position }));
      } catch (e) {
        error = e;
        throw e;
      }
    },
  });
  return {
    name: 'list-loader',
    load: async (ctx) => {
      items = undefined;
      error = undefined;
      await inner.load(ctx);
      if (error !== undefined) throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      if (items === undefined) throw new Error(`${path}: not found`);
      const loaded = ctx.store.keys().length;
      if (loaded !== items) throw new Error(`${path}: ${items} items, ${loaded} loaded (every item needs a unique id)`);
    },
  };
}
