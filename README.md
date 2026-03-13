# Microlink Benchmarks

A collection of benchmark tools that race Microlink APIs against competing services — one benchmark per product.

Each sub-folder is a self-contained benchmark with its own dependencies, adapters, and results.

## Benchmarks

| Folder | Product | Competitors tested |
|---|---|---|
| [`screenshot/`](./screenshot) | [Screenshot API](https://microlink.io/screenshot) | ScreenshotOne, ScreenshotMachine, ScreenshotAPI, Urlbox, ApiFlash, ScreenshotLayer |

## Methodology

To ensure a strictly objective baseline, each benchmark is built as a reproducible testing suite. Here is exactly how data is captured and aggregated:

**True Cold Starts** — Every request bypasses edge caching and warm browser pools. We measure the total round-trip latency: HTTP request → Headless Chrome boot → DOM render → pixel capture.

**Concurrent Execution** — All providers are triggered simultaneously for each target URL. If a target website experiences a latency spike or routing bottleneck, every provider faces the exact same conditions.

**10× Global Polling** — To account for AWS/GCP load balancing and natural internet traffic fluctuations, each benchmark is executed 10 separate times.

**Heavy Browser Workloads** — Tests go beyond simple viewport captures. Payload configurations force high device scale factors (Retina/2× resolution), full-page scrolling, and active ad-blocking across a mix of static HTML and heavy React SPAs.

**Outlier & Error Mitigation** — To prevent a single anomalous DNS timeout (e.g. a 25,000 ms spike) from corrupting the dataset, the single slowest execution out of the 10 runs is systematically dropped. Any request returning a non-200 HTTP error is also isolated and removed.

**Final Aggregation** — After cleaning the dataset, we calculate the strict `avgColdDuration` per URL and sum them into a `totalColdDuration` to determine the fastest overall provider.

## Screenshot Benchmark Results

> Last run: **March 2026** · 7 URLs · cold requests only (cache bypassed)

### Summary — Average Cold Duration

| Rank | Adapter | Avg Cold (ms) | vs Fastest |
|:----:|---------|:-------------:|:----------:|
| 1 | **Microlink** | **4,111.84** | — |
| 2 | ScreenshotAPI | 5,915.71 | +43.9% |
| 3 | ScreenshotMachine | 6,099.77 | +48.4% |
| 4 | Urlbox | 7,334.22 | +78.4% |
| 5 | ScreenshotOne | 7,711.14 | +87.5% |
| 6 | ApiFlash | 9,463.20 | +130.1% |

### Per-URL Cold Duration (ms)

| URL | Microlink | ScreenshotAPI | ScreenshotMachine | Urlbox | ScreenshotOne | ApiFlash |
|-----|----------:|:-------------:|:-----------------:|:------:|:-------------:|:--------:|
| vercel.com *(1920px, full-page, jpeg)* | **6,361** | 6,143 | 9,791 | 14,953 | 12,695 | 14,233 |
| example.com *(1280×800, png)* | **968** | 4,988 | 1,321 | 2,331 | 3,135 | 1,820 |
| stripe.com *(393×852, jpeg)* | **3,217** | 5,614 | 3,167 | 3,679 | 5,678 | 5,900 |
| screenshotone.com *(1920px, full-page, png)* | **5,474** | 6,805 | 12,404 | 14,976 | 12,139 | 9,802 |
| news.ycombinator.com *(1440px, full-page, jpeg)* | **3,435** | 5,385 | 4,329 | 4,748 | 6,857 | 1,968 |
| github.com/trending *(768×1024, png)* | **3,060** | 6,174 | 3,898 | 4,267 | 6,059 | 5,366 |
| framer.com *(1920×1800, jpeg)* | **6,267** | 6,301 | 7,789 | 6,386 | 7,415 | 27,154 |
| **Total** | **28.8 s** | **41.4 s** | **42.7 s** | **51.3 s** | **54.0 s** | **66.2 s** |

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
