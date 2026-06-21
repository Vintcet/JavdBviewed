# Performance Optimization Notes

## Current Build Signals

- `assets/templates/g2plot.min.js`: about 1.04 MB.
- `assets/templates/echarts.min.js`: about 1.03 MB.
- `assets/dashboard-*.css`: about 797 KB.
- `assets/dashboard.html-*.js`: about 613 KB.
- `assets/pageHandler-*.js`: about 361 KB.
- Font Awesome webfonts are emitted both as hashed assets and under `assets/fontawesome/webfonts`.

## Build Warnings To Address

- Several modules are both dynamically imported and statically imported, so Rollup cannot split them as intended.
- Large dashboard chunks exceed the 500 KB warning threshold.
- A favicon path is emitted twice: `assets/favicons/dark/favicon-32x32.png`.

## Recommended Follow-Up Order

1. Remove duplicate Font Awesome font emission.
2. Load report chart libraries only when opening generated insights reports.
3. Split dashboard CSS by page or settings section.
4. Split content `pageHandler` by list/detail/actor paths so ordinary list pages do not carry detail-only code.
5. Resolve mixed static/dynamic imports reported by Vite so lazy chunks are actually lazy.
6. Reduce default INFO logging during page initialization and list reprocessing.

