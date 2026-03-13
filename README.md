# Microlink Benchmarks

A collection of benchmark tools that race Microlink APIs against competing services — one benchmark per product.

Each sub-folder is a self-contained benchmark with its own dependencies, adapters, and results.

## Benchmarks

| Folder | Product | Competitors tested |
|---|---|---|
| [`screenshot/`](./screenshot) | [Screenshot API](https://microlink.io/screenshot) | ScreenshotOne, ScreenshotMachine, ScreenshotAPI, Urlbox, ApiFlash, ScreenshotLayer |

## Structure

```
screenshot/    # Screenshot API benchmark
  adapters/    # One file per provider
  results/     # JSON output (gitignored)
  benchmark.js # Entry point
  ...
<next-tool>/   # Future benchmarks follow the same pattern
```

## Running a benchmark

Navigate into the relevant folder and follow its README:

```bash
cd screenshot
npm install
cp .env.example .env   # add your API keys
node benchmark.js
```

## Adding a new benchmark

1. Create a new folder named after the Microlink product (e.g. `pdf/`, `scraper/`).
2. Follow the same adapter pattern used in `screenshot/` — each competitor is an isolated adapter file that exports a `capture()` function.
3. Add the new benchmark to the table above.
