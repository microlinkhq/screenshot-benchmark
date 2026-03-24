import { Client, TakeOptions } from 'screenshotone-api-sdk'

function buildOptions(url, opts) {
  let takeOpts = TakeOptions.url(url)

  if (opts.width) takeOpts = takeOpts.viewportWidth(opts.width)
  if (opts.height) takeOpts = takeOpts.viewportHeight(opts.height)
  if (opts.fullPage) takeOpts = takeOpts.fullPage(true)
  if (opts.format) takeOpts = takeOpts.format(opts.format)
  if (opts.deviceScaleFactor) takeOpts = takeOpts.deviceScaleFactor(opts.deviceScaleFactor)
  if (opts.imageQuality && format !== 'png') takeOpts = takeOpts.imageQuality(opts.quality)
  if (opts.adblock !== undefined) {
    takeOpts = takeOpts.blockAds(opts.adblock).blockCookieBanners(opts.adblock)
  }

  return takeOpts
}

export default {
  name: 'ScreenshotOne',
  slug: 'screenshotone',
  website: 'https://screenshotone.com',
  requiresKey: true,

  async capture({ url, width, height, fullPage, format, quality = 100, deviceScaleFactor = 1, adblock, cache: useCache = false }) {
    const accessKey = process.env.SCREENSHOTONE_API_KEY
    const secretKey = process.env.SCREENSHOTONE_SECRET_KEY || ''
    const client = new Client(accessKey, secretKey)
    const opts = { width, height, fullPage, format, quality, deviceScaleFactor, adblock }

    const cacheKey = Array.from({ length: 16 }, () => Math.random().toString(36)[2]).join('');
    const coldOpts = buildOptions(url, opts).cache(true).cacheKey(cacheKey)
    
    const coldUrl = await client.generateSignedTakeURL(coldOpts)
    
    const coldStart = performance.now()
    const coldResponse = await fetch(coldUrl)
    const coldDuration = performance.now() - coldStart

    const imageBuffer = Buffer.from(await coldResponse.arrayBuffer())

    let cachedDuration = null
    if (useCache) {
      const cachedOpts = buildOptions(url, opts).cache(true).cacheKey(cacheKey)
      const cachedUrl = await client.generateSignedTakeURL(cachedOpts)
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
