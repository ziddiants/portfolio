import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';
import { loadVersion, VersionError } from './versions/load.mjs';

// One build sees one version, chosen before the build starts by SITE_VERSION (ERD § Multi-version).
// Run it through npm run build / build:<id> / dev:<id>: they assemble .build/public-<id>/ first.
let v;
try {
  v = loadVersion(process.env.SITE_VERSION);
} catch (err) {
  if (!(err instanceof VersionError)) throw err;
  console.error(err.message);
  process.exit(1);
}

// Static output only (N14). No server adapter: an adapter is how SSR gets in.
export default defineConfig({
  output: 'static',
  site: v.siteUrl,
  // /work/x is served from work/x.html with no trailing slash (ERD § Routes, TC-A07).
  build: { format: 'file' },
  trailingSlash: 'never',
  publicDir: `.build/public-${v.id}`,
  outDir: `dist/${v.id}`,
  integrations: v.indexable ? [sitemap()] : [],
  vite: {
    resolve: {
      // Exact match, absolute path: "@version" is this version's settings file and nothing else.
      alias: [
        {
          find: /^@version$/,
          replacement: fileURLToPath(new URL(`./versions/${v.id}/version.json`, import.meta.url)),
        },
      ],
    },
  },
});
