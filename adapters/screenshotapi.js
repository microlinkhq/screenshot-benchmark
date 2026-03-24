function buildUrl(token, url, opts) {
  const params = new URLSearchParams({
    token,
    url,
    output: 'image',
    file_type: opts.format || 'png',
    width: String(opts.width || 1920),
    height: String(opts.height || 1080),
    fresh: 'true',
    enable_caching: 'true'
  })

  if (opts.fullPage) params.set('full_page', 'true')
  if (opts.deviceScaleFactor && opts.deviceScaleFactor > 1) params.set('retina', 'true')
  if (opts.adblock) params.set('block_ads', 'true')

  return `https://shot.screenshotapi.net/v3/screenshot?${params}`
}

export default {
  name: 'ScreenshotAPI',
  slug: 'screenshotapi',
  website: 'https://screenshotapi.net',
  requiresKey: true,

  async capture({ url, width, height, fullPage, format, quality, deviceScaleFactor = 1, adblock, cache = false }) {
    const token = process.env.SCREENSHOTAPI_API_KEY
    const opts = { width, height, fullPage, format, quality, deviceScaleFactor, adblock }

    // Cold request: fresh=true bypasses cache
    const coldUrl = buildUrl(token, url, opts)
    const coldStart = performance.now()
    const coldResponse = await fetch(coldUrl)
    const coldDuration = performance.now() - coldStart

    const imageBuffer = Buffer.from(await coldResponse.arrayBuffer())

    // Cached request: fresh=false uses cache
    const cachedParams = new URLSearchParams(new URL(coldUrl).search)
    cachedParams.set('fresh', 'false')
    const cachedUrl = `https://shot.screenshotapi.net/v3/screenshot?${cachedParams}`


    // TODO: Test later if they recover the cache - it seems like it's not working
    // const cachedStart = performance.now()
    // const cachedResponse = await fetch(cachedUrl)
    const cachedDuration = null //performance.now() - cachedStart

    return {
      coldDuration,
      cachedDuration,
      imageBuffer,
      imageSize: imageBuffer.length
    }
  }
}
