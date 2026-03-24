function buildUrl(url, opts, { force = false } = {}) {
  const params = new URLSearchParams({ url, meta: 'false' })

  params.set('screenshot.fullPage', opts.fullPage)
  params.set('screenshot.type', opts.format || 'png')
  params.set('viewport.width', opts.width || 1920)
  params.set('viewport.height', opts.height || 1080)
  params.set('viewport.deviceScaleFactor', opts.deviceScaleFactor || 1)
  params.set('adblock', opts.adblock)
  params.set('embed', 'screenshot.url')
  params.set('force', force)

  return `https://pro.microlink.io?${params}`
}

function buildHeaders(apiKey) {
  return apiKey ? { 'x-api-key': apiKey } : {}
}

export default {
  name: 'Microlink',
  slug: 'microlink',
  website: 'https://microlink.io',
  requiresKey: true,

  async capture({ url, width, height, fullPage, format, quality, deviceScaleFactor = 1, adblock, cache = false }) {
    const apiKey = process.env.MICROLINK_API_KEY || undefined
    const opts = { width, height, fullPage, format, quality, deviceScaleFactor, adblock }

    const headers = buildHeaders(apiKey)
    const coldUrl = buildUrl(url, opts, { force: true })

    const coldStart = performance.now()
    const coldResponse = await fetch(coldUrl, { headers })
    const coldDuration = performance.now() - coldStart

    const imageBuffer = Buffer.from(await coldResponse.arrayBuffer())

    let cachedDuration = null
    if (cache) {
      const cachedUrl = buildUrl(url, opts)
      const cachedStart = performance.now()
      const cachedResponse = await fetch(cachedUrl, { headers })
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
