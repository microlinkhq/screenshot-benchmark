const REQUEST_TIMEOUT_MS = 75_000

function buildUrl(apiKey, url, opts, { maxAgeHours } = {}) {
  const viewportWidth = Math.max(1, Number(opts.width || 1200))
  const deviceScaleFactor = Math.max(1, Number(opts.deviceScaleFactor || 1))
  const outputWidth = Math.max(1, Math.round(viewportWidth * deviceScaleFactor))

  const segments = [
    'noanimate',
    `width/${outputWidth}`,
    `viewportWidth/${viewportWidth}`,
    `maxAge/${maxAgeHours}`
  ]

  if (opts.format === 'png') {
    segments.push('png')
  } else {
    segments.push('allowJPG')
  }

  if (opts.fullPage) {
    segments.push('fullpage')
  } else if (opts.height) {
    segments.push(`crop/${Math.max(1, Number(opts.height))}`)
  }

  const params = new URLSearchParams({ url })

  return `https://image.thum.io/get/auth/${encodeURIComponent(apiKey)}/${segments.join('/')}/?${params}`
}

async function readImageBuffer(response, label) {
  const contentType = response.headers.get('content-type') || ''

  if (!response.ok || !contentType.startsWith('image/')) {
    const body = await response.text()
    throw new Error(
      `${label} failed: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 200)}` : ''}`
    )
  }

  return Buffer.from(await response.arrayBuffer())
}

async function fetchWithTimeout(url, label) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS}ms`)
    }

    throw error
  }
}

export default {
  name: 'Thum.io',
  slug: 'thumio',
  website: 'https://www.thum.io',
  requiresKey: true,

  async capture({ url, width, height, fullPage, format, quality = 100, deviceScaleFactor = 1, adblock, cache = false }) {
    // Thum.io docs expose width/crop/viewportWidth/fullpage, but not adblock or JPEG quality controls.
    const apiKey = process.env.THUMIO_API_KEY
    if (!apiKey) {
      throw new Error('THUMIO_API_KEY is required')
    }

    const opts = { width, height, fullPage, format, quality, deviceScaleFactor, adblock }

    const coldUrl = buildUrl(apiKey, url, opts, { maxAgeHours: 0 })
    const coldStart = performance.now()
    const coldResponse = await fetchWithTimeout(coldUrl, 'Cold request')
    const coldDuration = performance.now() - coldStart
    const imageBuffer = await readImageBuffer(coldResponse, 'Cold request')

    let cachedDuration = null
    if (cache) {
      const cachedUrl = buildUrl(apiKey, url, opts, { maxAgeHours: 24 })
      const cachedStart = performance.now()
      const cachedResponse = await fetchWithTimeout(cachedUrl, 'Cached request')
      cachedDuration = performance.now() - cachedStart
      await readImageBuffer(cachedResponse, 'Cached request')
    }

    return {
      coldDuration,
      cachedDuration,
      imageBuffer,
      imageSize: imageBuffer.length
    }
  }
}
