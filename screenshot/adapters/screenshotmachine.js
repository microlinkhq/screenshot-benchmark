import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const screenshotmachine = require('screenshotmachine')

function buildOptions(url, opts) {
  const height = opts.fullPage ? 'full' : (opts.height || 1080)
  const dimension = `${opts.width || 1920}x${height}`
  const zoom = opts.deviceScaleFactor ? String(opts.deviceScaleFactor * 100) : '100'

  return {
    url,
    dimension,
    device: 'desktop',
    format: opts.format || 'png',
    zoom
  }
}

export default {
  name: 'ScreenshotMachine',
  slug: 'screenshotmachine',
  website: 'https://screenshotmachine.com',
  requiresKey: true,

  async capture({ url, width, height, fullPage, format, quality, deviceScaleFactor = 1, adblock, cache = false }) {
    const customerKey = process.env.SCREENSHOTMACHINE_API_KEY
    const secretPhrase = process.env.SCREENSHOTMACHINE_SECRET_PHRASE || ''
    const opts = { width, height, fullPage, format, quality, deviceScaleFactor }

    const coldOptions = { ...buildOptions(url, opts), cacheLimit: '0' }
    const coldUrl = screenshotmachine.generateScreenshotApiUrl(customerKey, secretPhrase, coldOptions)
    const coldStart = performance.now()
    const coldResponse = await fetch(coldUrl)
    const coldDuration = performance.now() - coldStart

    const imageBuffer = Buffer.from(await coldResponse.arrayBuffer())

    let cachedDuration = null
    if (cache) {
      const cachedOptions = { ...buildOptions(url, opts), cacheLimit: '1' }
      const cachedUrl = screenshotmachine.generateScreenshotApiUrl(customerKey, secretPhrase, cachedOptions)
      const cachedStart = performance.now()
      const cachedResponse = await fetch(cachedUrl)
      cachedDuration = performance.now() - cachedStart
      await cachedResponse.arrayBuffer()
    }

    return {
      coldDuration,
      cachedDuration,
      imageBuffer,
      imageSize: imageBuffer.length
    }
  }
}
