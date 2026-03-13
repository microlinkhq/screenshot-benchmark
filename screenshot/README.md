# Screenshot API Benchmark

A terminal-based benchmark tool that races screenshot APIs against each other, showing live progress bars and a ranked summary table.

## Benchmark Results

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
| vercel.com *(1920px, full-page, jpeg)* | 6,361 | 6,143 | 9,791 | 14,953 | 12,695 | 14,233 |
| example.com *(1280×800, png)* | 968 | 4,988 | 1,321 | 2,331 | 3,135 | 1,820 |
| stripe.com *(393×852, jpeg)* | 3,217 | 5,614 | 3,167 | 3,679 | 5,678 | 5,900 |
| screenshotone.com *(1920px, full-page, png)* | 5,474 | 6,805 | 12,404 | 14,976 | 12,139 | 9,802 |
| news.ycombinator.com *(1440px, full-page, jpeg)* | 3,435 | 5,385 | 4,329 | 4,748 | 6,857 | 1,968 |
| github.com/trending *(768×1024, png)* | 3,060 | 6,174 | 3,898 | 4,267 | 6,059 | 5,366 |
| framer.com *(1920×1800, jpeg)* | 6,267 | 6,301 | 7,789 | 6,386 | 7,415 | 27,154 |
| **Total** | **28.8 s** | **41.4 s** | **42.7 s** | **51.3 s** | **54.0 s** | **66.2 s** |

## Quick start

```bash
npm install
cp .env.example .env   # add your API keys
node benchmark.js
# or
npm start
```

## API keys

Configure keys in `.env`:

| Variable | Required | Notes |
|---|---|---|
| `MICROLINK_API_KEY` | Yes | Adapter is skipped if missing. |
| `SCREENSHOTONE_API_KEY` | Yes | Adapter is skipped if missing. |
| `SCREENSHOTONE_SECRET_KEY` | No | Optional signing key. |
| `SCREENSHOTMACHINE_API_KEY` | Yes | Adapter is skipped if missing. |
| `SCREENSHOTMACHINE_SECRET_PHRASE` | No | Optional secret phrase for signed URLs. |
| `SCREENSHOTAPI_API_KEY` | Yes | Adapter is skipped if missing. |
| `URLBOX_API_KEY` | Yes | Adapter is skipped if missing. |
| `URLBOX_API_SECRET` | Yes | Required alongside the API key. |
| `APIFLASH_API_KEY` | Yes | Adapter is skipped if missing. |
| `SCREENSHOTLAYER_API_KEY` | Yes | Excluded from default runs due to low free-plan concurrency. Run explicitly with `node benchmark.js screenshotlayer`. |

## Metrics

Each URL is tested per adapter, measuring:

- **Cold duration** — response time with cache bypassed (fresh render)
- **Cached duration** — response time served from cache (only when `--cache` is passed)
- **Image size** — bytes of the returned image
- **Image quality** — sharpness score (Laplacian variance)

## CLI options

- **Adapter filter** — Pass one or more adapter slugs to run only those adapters:  
  `node benchmark.js microlink screenshotone`  
  Available slugs: `microlink`, `screenshotone`, `screenshotmachine`, `screenshotapi`, `urlbox`, `apiflash`, `screenshotlayer`.
- **`--cache`** — Also measure cached response times. Without this flag, only cold (fresh) requests are made. Adapters that don't support cache measurement will return `null` for cached duration.
- **`--savescreenshots`** — Save each captured image to `tmp/` (e.g. `vercel.com_1920x1080_microlink.jpeg`).
- **`--showdetail`** — Print per-URL cold duration tables after the summary. When combined with `--cache`, also prints cached duration tables.

## Output

Results are saved to `results/benchmark-<timestamp>.json` after each run. When you filter by adapters, the filename includes their slugs: `results/benchmark-microlink-screenshotone-<timestamp>.json`.

## Adding a new adapter

1. Create a file in `adapters/`, e.g. `adapters/myapi.js`
2. Export a default object with this interface:

```js
export default {
  name: 'MyAPI',
  slug: 'myapi',
  website: 'https://myapi.com',
  requiresKey: true, // false if a free tier exists

  async capture({ url, width, height, fullPage, format, quality, cache = false }) {
    // Make cold request (cache bypassed)
    // ...

    let cachedDuration = null
    if (cache) {
      // Make cached request (cache enabled)
    }

    return {
      coldDuration,    // ms
      cachedDuration,  // ms or null if cache is false / not supported
      imageBuffer,     // Buffer
      imageSize        // bytes
    }
  }
}
```

3. If `requiresKey: true`, set `MYAPI_API_KEY` in `.env`. The benchmark skips adapters whose key is missing.

No changes to the core benchmark code are needed.

## File structure

```
adapters/
  apiflash.js            # ApiFlash adapter
  microlink.js           # Microlink adapter
  screenshotapi.js       # ScreenshotAPI adapter
  screenshotlayer.js     # ScreenshotLayer adapter
  screenshotmachine.js   # ScreenshotMachine adapter
  screenshotone.js       # ScreenshotOne adapter
  urlbox.js              # Urlbox adapter
results/                 # JSON output (gitignored, created at runtime)
tmp/                     # Saved screenshots when using --savescreenshots (gitignored)
benchmark.js             # Entry point, race UI, orchestration
config.js                # TEST_URLS and shared configuration
.env.example             # Documents all API keys
package.json             # ESM, all dependencies
```
