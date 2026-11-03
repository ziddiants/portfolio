# Portfolio

Source code for Aditya Gupta's product portfolio: two static sites built from
one codebase and deployed to Cloudflare Pages. No server, no database, no
tracking beyond privacy-friendly page-view analytics.

- **Payments** — product work in consumer payments and monetization.
- **Consumer Apps** — product work in consumer apps and monetization.

Both sites share every page and section. Only the résumé and a small settings
file differ per version.

## Tech

Astro (static output), zero client JavaScript by default, system fonts, and a
design driven by tokens. The full engineering plan lives in a private vault,
not in this repository.

## Develop

Requires Node 24 (see `.nvmrc`).

```sh
npm run doctor          # check the local toolchain, logins and setup are ready
npm run dev:payments    # local preview of one version (or: npm run dev -- <id>)
npm run build           # every version into dist/<id>/, each then verified
npm run build:payments  # one version (or: node scripts/build-all.mjs <id>)
npm run test:versions   # multi-version build tests
```

Each folder in `versions/` is one version of the site: a `version.json`
settings file, a résumé and a preview image. A build sees only one version.
Adding a version is adding a folder; no shared file changes.

More commands (verify, release) land as the build progresses and will be
listed here.

## Repository rules

A pre-commit hook and `.gitignore` keep private material out of this public
repository. Internal documents and any names list live only in the private
vault. Do not disable the hook.

## Rights

© 2026 Aditya Gupta. All rights reserved.

The written content, case studies, résumés, and images in this repository are
the property of Aditya Gupta and may not be copied or reused without written
permission. No license is granted for the content. The code is published for
reference; contact the owner before reuse.
