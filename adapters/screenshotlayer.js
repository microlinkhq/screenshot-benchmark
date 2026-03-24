function buildUrl(accessKey, url, opts, { force = false } = {}) {
  const viewport = `${opts.width || 1440}x${opts.height || 900}`

  const params = new URLSearchParams({
    access_key: accessKey,
    url,
    viewport,
    format: opts.format || 'png'
  })

  if (opts.fullPage) params.set('fullpage', '1')
  if (force) {
    params.set('ttl', '300')
    params.set('force', '1')
  }

  return `https://api.screenshotlayer.com/api/capture?${params}`
}

export default {
  name: 'ScreenshotLayer',
  slug: 'screenshotlayer',
  website: 'https://screenshotlayer.com',
  requiresKey: true,

  async capture({ url, width, height, fullPage, format, quality, deviceScaleFactor = 1, adblock, cache = false }) {
    const accessKey = process.env.SCREENSHOTLAYER_API_KEY
    const opts = { width, height, fullPage, format, quality, deviceScaleFactor, adblock }

    const coldUrl = buildUrl(accessKey, url, opts, { force: true })
    
    const coldStart = performance.now()
    const coldResponse = await fetch(coldUrl)
    const coldDuration = performance.now() - coldStart

    if (!coldResponse.ok) {
      throw new Error(`Cold request failed: ${coldResponse.status} ${coldResponse.statusText}`)
    }

    const imageBuffer = Buffer.from(await coldResponse.arrayBuffer())

    let cachedDuration = null
    if (cache) {
      const cachedUrl = buildUrl(accessKey, url, opts)
      const cachedStart = performance.now()
      const cachedResponse = await fetch(cachedUrl)
      cachedDuration = performance.now() - cachedStart
      await cachedResponse.arrayBuffer()
    }

    await new Promise(resolve => setTimeout(resolve, 70000))

    return {
      coldDuration,
      cachedDuration,
      imageBuffer,
      imageSize: imageBuffer.length
    }
  }
}
