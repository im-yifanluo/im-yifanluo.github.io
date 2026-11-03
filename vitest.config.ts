/// <reference types="vitest/config" />
// The unit tests run on Astro's Vite config, so they resolve `@/` and `astro:content` as the site does.
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: { include: ['tests/unit/**/*.test.ts'] },
});
