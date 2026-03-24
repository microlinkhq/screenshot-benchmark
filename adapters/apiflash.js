function buildUrl(accessKey, url, opts, { fresh = false } = {}) {
  const params = new URLSearchParams({
    access_key: accessKey,
    url,
    format: opts.format || 'jpeg',
    width: String(opts.width || 1920),
    height: String(opts.height || 1080),
    scale_factor: String(opts.deviceScaleFactor || 1),
    fresh: String(fresh),
    response_type: 'image'
  })

  if (opts.fullPage) params.set('full_page', 'true')
  if (opts.quality && opts.format !== 'png') params.set('quality', String(opts.quality))
  if (opts.adblock) params.set('no_ads', 'true')

  return `https://api.apiflash.com/v1/urltoimage?${params}`
}

export default {
  name: 'ApiFlash',
  slug: 'apiflash',
  website: 'https://apiflash.com',
  requiresKey: true,

  async capture({ url, width, height, fullPage, format, quality, deviceScaleFactor = 1, adblock, cache = false }) {
    const accessKey = process.env.APIFLASH_API_KEY
    const opts = { width, height, fullPage, format, quality, deviceScaleFactor, adblock }

    const coldUrl = buildUrl(accessKey, url, opts, { fresh: true })
    
    const coldStart = performance.now()
    const coldResponse = await fetch(coldUrl)
    const coldDuration = performance.now() - coldStart

    const imageBuffer = Buffer.from(await coldResponse.arrayBuffer())

    let cachedDuration = null
    if (cache) {
      const cachedUrl = buildUrl(accessKey, url, opts)
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
