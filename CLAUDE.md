# plasim-blocking-atlas

Public static site served by GitHub Pages from `main` (`/`). Vanilla ES modules: no build step, no npm packages, no CDN.

## Invariants
- The repository is public. Never add a season id, source root, simulation or run name, file path, account or user name.
  Before any commit, `node --test --test-concurrency=1 tests/` and `node tools/check-site.mjs` must pass. Run one test
  process at a time: shared login nodes cap processes per user. The data producer also runs a stricter, private scan
  before every publish.
- `data/` is generated. Never hand-edit it. Replace it only with `tools/sync-data.sh <site dir>`, which verifies
  `SHA256SUMS`.
- User text (notes, tags) reaches the page only as text nodes (`ui.el` / `textContent`), never through `innerHTML`.
- Annotations live in the visitor's browser (localStorage) and travel only as exported JSON (`blockform01-annotations/1`).
- Pushing, Pages settings and visibility changes need the owner's approval.
