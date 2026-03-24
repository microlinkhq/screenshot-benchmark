import 'dotenv/config'
import { readdir, writeFile, mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import sharp from 'sharp'
import { TEST_URLS } from './config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMP_DIR = join(__dirname, 'tmp')
const BAR_WIDTH = 30
const NAME_WIDTH = 18
const THROTTLE_MS = 100
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const TIMER_INTERVAL_MS = 120

async function loadAdapters() {
  const dir = join(__dirname, 'adapters')
  const files = await readdir(dir)
  const adapters = []

  for (const file of files) {
    if (!file.endsWith('.js')) continue
    const filePath = join(dir, file)
    const mod = await import(pathToFileURL(filePath).href)
    adapters.push(mod.default)
  }

  return adapters
}

async function computeSharpness(buffer) {
  const { data, info } = await sharp(buffer)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  let sum = 0
  let count = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const laplacian =
        -4 * data[idx] +
        data[idx - 1] +
        data[idx + 1] +
        data[idx - width] +
        data[idx + width]
      sum += laplacian * laplacian
      count++
    }
  }

  return count > 0 ? sum / count : 0
}

function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

function formatMs(ms) {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

function formatElapsed(seconds) {
  if (seconds < 60) return `${Math.floor(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}m ${s}s`
}

function urlToDomain(url) {
  try {
    return new URL(url).hostname
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/[^a-z0-9.-]/gi, '_')
  }
}

async function saveScreenshotToTemp(buffer, { url, width, height, format }, adapterSlug) {
  const domain = urlToDomain(url)
  const ext = format || 'png'
  const name = `${domain}_${width}x${height}_${adapterSlug}.${ext}`
  const filePath = join(TEMP_DIR, name)
  await writeFile(filePath, buffer)
  return filePath
}

// ── Race renderer ──────────────────────────────────────────────
// Strategy: cursor always sits on a "parking" line below all race lines.
// To update line i (0-based), move up (totalLines - i) rows, clear and
// rewrite, then move back down to the parking line.

class RaceRenderer {
  constructor(adapters, totalPerAdapter, { showCache = false } = {}) {
    this.adapters = adapters
    this.total = totalPerAdapter
    this.lineCount = adapters.length
    this.lastRender = 0
    this.startTime = Date.now()
    this.spinnerIndex = 0
    this.timerInterval = null
    this.showCache = showCache

    this.states = adapters.map(a => ({
      slug: a.slug,
      name: a.name,
      done: 0,
      successes: 0,
      lastCold: 0,
      lastCached: 0,
      lastDomain: '',
      finished: false
    }))
  }

  getState(slug) {
    return this.states.find(s => s.slug === slug)
  }

  // Reserve lines: timer (above table), header, blank, adapter lines; cursor parks below
  init(headerLine) {
    this.headerLine = headerLine
    this.renderAll(true) // first time: don't move up, just print
    this.timerInterval = setInterval(() => {
      this.spinnerIndex = (this.spinnerIndex + 1) % SPINNER_FRAMES.length
      this.renderAll()
    }, TIMER_INTERVAL_MS)
  }

  stop() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  }

  recordSuccess(slug, coldDuration, cachedDuration, domain) {
    const state = this.getState(slug)
    state.done++
    state.successes++
    state.lastCold = coldDuration ?? 0
    state.lastCached = cachedDuration ?? 0
    state.lastDomain = domain ?? ''
    this.throttledRender()
  }

  recordFailure(slug) {
    const state = this.getState(slug)
    state.done++
    this.throttledRender()
  }

  markFinished(slug) {
    this.getState(slug).finished = true
    this.renderAll()
  }

  throttledRender() {
    const now = Date.now()
    if (now - this.lastRender < THROTTLE_MS) return
    this.lastRender = now
    this.renderAll()
  }

  buildTimerLine() {
    const elapsedSec = (Date.now() - this.startTime) / 1000
    const frame = SPINNER_FRAMES[this.spinnerIndex]
    return chalk.cyan(`  ${frame} ${formatElapsed(elapsedSec)}`)
  }

  renderAll(skipMoveUp = false) {
    const n = this.lineCount
    const totalLines = 4 + (n * 2)
    if (!skipMoveUp) {
      process.stdout.write(`\x1b[${totalLines}A`)
    }
    process.stdout.write(`\r\x1b[2K\n`)
    process.stdout.write(`\r\x1b[2K${this.headerLine}\n`)
    process.stdout.write(`\r\x1b[2K\n`)
    for (let i = 0; i < n; i++) {
      process.stdout.write(`\r\x1b[2K${this.buildLine(this.states[i])}\n\n`)
    }
    process.stdout.write(`\n\r\x1b[2K${this.buildTimerLine()}`)
  }

  buildLine(state) {
    const { name, done, successes, lastCold, lastCached, lastDomain, finished } = state
    const pct = this.total > 0 ? done / this.total : 0
    const filled = Math.round(pct * BAR_WIDTH)
    const empty = BAR_WIDTH - filled

    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty))
    const progress = `${String(done).padStart(2)}/${this.total}`
    const successPct = (done > 0
      ? `${Math.round((successes / done) * 100)}%`
      : '0%').padStart(4)
    const coldStr = lastCold > 0 ? formatMs(lastCold).padStart(8) : ''.padStart(8)
    const domainStr = lastDomain ? chalk.cyan(lastDomain.slice(0, 28).padEnd(28)) : ''.padEnd(28)

    let nameStr
    const shownName = name.length > 14 ? name.slice(0, 14) : name;
    if (finished) {
      const rate = done > 0 ? successes / done : 0
      const mark = rate === 1 ? chalk.green(' ✓') : chalk.red(' ✗')
      nameStr = chalk.bold(shownName + mark + ' '.padEnd(NAME_WIDTH - shownName.length - 2))
    } else {
      nameStr = chalk.bold(shownName.padEnd(NAME_WIDTH))
    }

    if (this.showCache) {
      const cacheStr = lastCached > 0 ? formatMs(lastCached).padStart(8) : ''.padStart(8)
      return `  ${nameStr} ${bar}  ${progress}  ${successPct}  ${coldStr}  ${cacheStr}  ${domainStr}`
    }

    return `  ${nameStr} ${bar}  ${progress}  ${successPct}  ${coldStr}  ${domainStr}`
  }
}

// ── Error log ──────────────────────────────────────────────────

function printErrors(results, adapters) {
  const errorResults = results.filter(r => !r.success && r.error)
  if (errorResults.length === 0) return

  console.log(chalk.bold('\n  ⚠ Errors\n'))

  for (const adapter of adapters) {
    const adapterErrors = errorResults.filter(r => r.slug === adapter.slug)
    if (adapterErrors.length === 0) continue

    console.log(chalk.red(`  ${adapter.name}`))
    for (const r of adapterErrors) {
      console.log(chalk.gray(`    ${urlToDomain(r.url)}: `) + r.error)
    }
    console.log()
  }
}

// ── Summary table ──────────────────────────────────────────────

function printSummary(results, adapters, { showCache = false } = {}) {
  console.log(chalk.bold('\n  📊 Results\n'))

  const header = showCache
    ? ['Rank', 'API', 'Total time', 'Avg Cold', 'Avg Cached', 'Total Size', 'Avg Size', 'Avg Quality', 'Success']
    : ['Rank', 'API', 'Total time', 'Avg Cold', 'Total Size', 'Avg Size', 'Avg Quality', 'Success']
  const summaries = []

  for (const adapter of adapters) {
    const adapterResults = results.filter(r => r.slug === adapter.slug)
    const successResults = adapterResults.filter(r => r.success)
    const total = adapterResults.length
    const ok = successResults.length

    const avgCold = ok > 0
      ? successResults.reduce((s, r) => s + r.coldDuration, 0) / ok
      : Infinity
    const avgCached = showCache && ok > 0
      ? successResults.reduce((s, r) => s + (r.cachedDuration ?? 0), 0) / ok
      : Infinity
    const totalTime = successResults.reduce(
      (s, r) => s + (r.coldDuration ?? 0) + (showCache ? (r.cachedDuration ?? 0) : 0),
      0
    )
    const totalSize = successResults.reduce((s, r) => s + (r.imageSize ?? 0), 0)
    const avgSize = ok > 0
      ? successResults.reduce((s, r) => s + r.imageSize, 0) / ok
      : 0
    const avgQuality = ok > 0
      ? successResults.reduce((s, r) => s + (r.imageQuality || 0), 0) / ok
      : 0

    summaries.push({
      name: adapter.name,
      avgCold,
      avgCached,
      totalSize,
      avgSize,
      avgQuality,
      ok,
      total,
      totalTime
    })
  }

  summaries.sort((a, b) => a.avgCold - b.avgCold)

  const rows = showCache
    ? summaries.map((s, i) => [
        String(i + 1),
        s.name,
        s.totalTime === 0 ? '-' : formatDuration(s.totalTime),
        s.avgCold === Infinity ? '-' : formatDuration(s.avgCold),
        s.avgCached === Infinity ? '-' : formatDuration(s.avgCached),
        s.totalSize === 0 ? '-' : formatSize(s.totalSize),
        s.avgSize === 0 ? '-' : formatSize(s.avgSize),
        s.avgQuality === 0 ? '-' : s.avgQuality.toFixed(1),
        `${s.ok}/${s.total}`
      ])
    : summaries.map((s, i) => [
        String(i + 1),
        s.name,
        s.totalTime === 0 ? '-' : formatDuration(s.totalTime),
        s.avgCold === Infinity ? '-' : formatDuration(s.avgCold),
        s.totalSize === 0 ? '-' : formatSize(s.totalSize),
        s.avgSize === 0 ? '-' : formatSize(s.avgSize),
        s.avgQuality === 0 ? '-' : s.avgQuality.toFixed(1),
        `${s.ok}/${s.total}`
      ])

  const colWidths = header.map((h, i) =>
    Math.max(h.length, ...rows.map(r => r[i].length)) + 2
  )

  const separator = colWidths.map(w => '─'.repeat(w)).join('─')

  console.log(chalk.gray(`  ${separator}`))
  console.log('  ' + header.map((h, i) => chalk.bold(h.padEnd(colWidths[i]))).join(' '))
  console.log(chalk.gray(`  ${separator}`))

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const formatted = row.map((cell, ci) => cell.padEnd(colWidths[ci])).join(' ')
    if (i === 0) {
      console.log(chalk.green(`   🏆${formatted.slice(2)}`))
    } else {
      console.log(`   ${formatted}`)
    }
  }

  console.log(chalk.gray(`  ${separator}`))
}

// ── Detail table ───────────────────────────────────────────────

function printDetailTable(results, adapters, type = 'cold') {
  const isCold = type === 'cold'
  const label = isCold ? 'Cold Time Detail' : 'Cache Time Detail'
  const durationKey = isCold ? 'coldDuration' : 'cachedDuration'

  console.log(chalk.bold(`\n  🔍 ${label}\n`))

  const domains = [...new Set(results.map(r => urlToDomain(r.url)))]
  const domainLabels = domains.map(d => d.replace(/\.[^.]+$/, ''))
  const NAME_COL = 15
  const COL_PAD = 2

  // Build cell data and compute column widths
  const colWidths = domainLabels.map(d => Math.max(d.length, 6) + COL_PAD)
  const rows = []

  for (const adapter of adapters) {
    const cells = domains.map((domain, di) => {
      const match = results.find(r => r.slug === adapter.slug && urlToDomain(r.url) === domain && r.success)
      const val = match ? formatMs(match[durationKey]) : '-'
      const raw = match ? match[durationKey] : Infinity
      colWidths[di] = Math.max(colWidths[di], val.length + COL_PAD)
      return { val, raw }
    })
    rows.push({ name: adapter.name.slice(0, NAME_COL).padEnd(NAME_COL), cells })
  }

  // Find fastest (min time) per domain
  const minPerDomain = domains.map((_, di) => {
    const times = rows.map(r => r.cells[di].raw).filter(t => t >= 1 && t < Infinity)
    return times.length > 0 ? Math.min(...times) : Infinity
  })

  // Header
  const headerCols = domainLabels.map((d, i) => d.slice(0, colWidths[i]).padEnd(colWidths[i]))
  const separator = '─'.repeat(NAME_COL + COL_PAD + colWidths.reduce((s, w) => s + w, 0))

  console.log(chalk.gray(`  ${separator}`))
  console.log('  ' + chalk.bold(''.padEnd(NAME_COL + COL_PAD)) + headerCols.map(c => chalk.bold(c)).join(''))
  console.log(chalk.gray(`  ${separator}`))

  for (const row of rows) {
    const line = row.cells.map((c, i) => {
      const padded = c.val.padEnd(colWidths[i])
      return c.raw === minPerDomain[i] && c.raw >= 1 ? chalk.green(padded) : padded
    }).join('')
    console.log(`  ${chalk.bold(row.name)}  ${line}`)
  }

  console.log(chalk.gray(`  ${separator}`))
}

// ── Main ───────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2).map(s => s.trim()).filter(Boolean)
  const saveScreenshots = args.some(a => a.toLowerCase() === '--savescreenshots')
  const showDetail = args.some(a => a.toLowerCase() === '--showdetail')
  const useCache = args.some(a => a.toLowerCase() === '--cache')
  const requestedSlugs = args
    .filter(a => !a.startsWith('--'))
    .map(s => s.toLowerCase())
  return { requestedSlugs, saveScreenshots, showDetail, useCache }
}

async function runBenchmark() {
  const { requestedSlugs, saveScreenshots, showDetail, useCache } = parseArgs()
  const adapters = await loadAdapters()
  const availableSlugs = adapters.map(a => a.slug)

  if (requestedSlugs.length > 0) {
    const invalid = requestedSlugs.filter(s => !availableSlugs.includes(s))
    if (invalid.length > 0) {
      console.error(chalk.red(`Adapter(s) not found: ${invalid.join(', ')}. Available: ${availableSlugs.join(', ')}.`))
      process.exit(1)
    }
  } else {
    // Remove ScreenshotLayer from the adapters list - low concurrency on the FREE plan
    // To test it run the benchmark with it's name specified: node benchmark.js screenshotlayer
    const filtered = adapters.filter(a => a.slug !== 'screenshotlayer')
    adapters.length = 0
    adapters.push(...filtered)
  }

  console.log(chalk.bold('\n\n  🏁 Screenshot API Benchmark\n'))
  
  const activeAdapters = []
  const wantAdapter = (adapter) =>
    requestedSlugs.length === 0 || requestedSlugs.includes(adapter.slug)

  for (const adapter of adapters) {
    if (!wantAdapter(adapter)) continue
    if (adapter.requiresKey) {
      const keyName = `${adapter.slug.toUpperCase().replace(/-/g, '_')}_API_KEY`
      if (!process.env[keyName]) {
        console.log(chalk.yellow(`  ⚠ Skipping ${adapter.name}: ${keyName} not set in .env\n`))
        continue
      }
    }
    activeAdapters.push(adapter)
    if (adapter.slug === 'screenshotlayer') {
      console.log(chalk.yellow('\nScreenshotLayer has a 60 second delay every two requests.\n'))
    }
  }

  if (activeAdapters.length === 0) {
    console.log(chalk.red('  No adapters available. Check your .env file.\n'))
    process.exit(1)
  }

  console.log(chalk.gray(`  URLs: ${TEST_URLS.length} | Adapters: ${activeAdapters.length}`))

  const totalPerAdapter = TEST_URLS.length
  const renderer = new RaceRenderer(activeAdapters, totalPerAdapter, { showCache: useCache })
  const results = []

  if (saveScreenshots) {
    await mkdir(TEMP_DIR, { recursive: true })
  }

  const raceHeader = useCache
    ? chalk.gray(`  ${'API'.padEnd(NAME_WIDTH)} ${'Progress'.padEnd(BAR_WIDTH + 2)} Done   OK      Cold     Cache    Domain`)
    : chalk.gray(`  ${'API'.padEnd(NAME_WIDTH)} ${'Progress'.padEnd(BAR_WIDTH + 2)} Done   OK      Cold     Domain`)
  renderer.init(raceHeader)

  // Run all adapters in parallel; each adapter runs its URLs sequentially
  await Promise.all(activeAdapters.map(async (adapter) => {
    for (const testCase of TEST_URLS) {
      const { url, ...captureOpts } = testCase

      const result = {
        adapter: adapter.name,
        slug: adapter.slug,
        url,
        success: false,
        error: null,
        coldDuration: null,
        ...(useCache ? { cachedDuration: null } : {}),
        imageSize: null,
        imageQuality: null
      }

      try {
        const data = await adapter.capture({ url, ...captureOpts, cache: useCache })

        result.coldDuration = data.coldDuration
        if (useCache) result.cachedDuration = data.cachedDuration
        result.imageSize = data.imageSize
        result.success = true

        if (data.imageBuffer && data.imageBuffer.length > 0) {
          result.imageQuality = await computeSharpness(data.imageBuffer)
          if (saveScreenshots) {
            await saveScreenshotToTemp(data.imageBuffer, { url, ...captureOpts }, adapter.slug)
          }
        }

        renderer.recordSuccess(adapter.slug, data.coldDuration, data.cachedDuration, urlToDomain(url))
      } catch (err) {
        result.error = err.message || String(err)
        renderer.recordFailure(adapter.slug)
      }

      results.push(result)
    }

    renderer.markFinished(adapter.slug)
  }))

  renderer.stop()
  // Final newline to exit the race area
  console.log()

  printSummary(results, activeAdapters, { showCache: useCache })

  if (showDetail) {
    printDetailTable(results, activeAdapters, 'cold')
    if (useCache) printDetailTable(results, activeAdapters, 'cached')
  }

  if (saveScreenshots) {
    const savedCount = results.filter(r => r.success).length
    if (savedCount > 0) {
      console.log(chalk.gray(`  Screenshots saved to ${TEMP_DIR} (${savedCount} files)\n`))
    }
  }

  printErrors(results, activeAdapters)

  const useSlugsInFilename = requestedSlugs.length > 0
  await exportResults(results, activeAdapters, { useSlugsInFilename, showCache: useCache })
}

// ── JSON export ────────────────────────────────────────────────

async function exportResults(results, adapters, { useSlugsInFilename = false, showCache = false } = {}) {
  const timestamp = new Date().toISOString()
  const fileTimestamp = timestamp.replace(/[:.]/g, '-')
  const baseName = useSlugsInFilename
    ? `benchmark-${adapters.map(a => a.slug).join('-')}`
    : 'benchmark'

  const adapterResults = {}

  for (const adapter of adapters) {
    const perUrl = results
      .filter(r => r.slug === adapter.slug)
      .map(r => {
        const entry = {
          url: r.url,
          coldDuration: r.coldDuration,
          ...(showCache ? { cachedDuration: r.cachedDuration } : {}),
          imageSize: r.imageSize,
          imageQuality: r.imageQuality,
          success: r.success,
          error: r.error
        }
        return entry
      })

    const successResults = perUrl.filter(r => r.success)
    const ok = successResults.length
    const total = perUrl.length

    const avgCold = ok > 0
      ? successResults.reduce((s, r) => s + r.coldDuration, 0) / ok
      : 0

    const totalTime = successResults.reduce(
      (s, r) => s + (r.coldDuration ?? 0) + (showCache ? (r.cachedDuration ?? 0) : 0),
      0
    )

    const summary = {
      totalTime: Math.round(totalTime * 100) / 100,
      avgColdDuration: Math.round(avgCold * 100) / 100,
      avgImageSize: ok > 0
        ? Math.round(successResults.reduce((s, r) => s + r.imageSize, 0) / ok)
        : 0,
      avgImageQuality: ok > 0
        ? Math.round(successResults.reduce((s, r) => s + (r.imageQuality || 0), 0) / ok * 100) / 100
        : 0,
      successRate: total > 0
        ? Math.round((ok / total) * 100) / 100
        : 0,
      totalRequests: total
    }

    if (showCache) {
      const avgCached = ok > 0
        ? successResults.reduce((s, r) => s + (r.cachedDuration ?? 0), 0) / ok
        : 0
      summary.avgCachedDuration = Math.round(avgCached * 100) / 100
      summary.cacheSpeedup = avgCached > 0
        ? Math.round((avgCold / avgCached) * 100) / 100
        : 0
    }

    adapterResults[adapter.slug] = {
      name: adapter.name,
      website: adapter.website,
      perUrl,
      summary
    }
  }

  // Winner = adapter with lowest avgColdDuration among those with successRate > 0
  const ranked = Object.entries(adapterResults)
    .filter(([, v]) => v.summary.successRate > 0)
    .sort(([, a], [, b]) => a.summary.avgColdDuration - b.summary.avgColdDuration)

  const winner = ranked.length > 0 ? ranked[0][0] : null

  const output = {
    timestamp,
    testUrls: TEST_URLS,
    results: adapterResults,
    winner
  }

  const resultsDir = join(__dirname, 'results')
  await mkdir(resultsDir, { recursive: true })

  const outputPath = join(resultsDir, `${baseName}-${fileTimestamp}.json`)
  await writeFile(outputPath, JSON.stringify(output, null, 2))
  // console.log(chalk.gray(`\n  Results saved to ${outputPath}\n`))
  console.log('\n\n')
}

runBenchmark().catch(err => {
  console.error(chalk.red(`\nFatal error: ${err.message}`))
  process.exit(1)
})
