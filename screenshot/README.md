# Screenshot API Benchmark

A terminal-based benchmark tool that races screenshot APIs against each other, showing live progress bars and a ranked summary table.

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
