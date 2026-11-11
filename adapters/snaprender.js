const ENDPOINT = 'https://app.snap-render.com/v1/screenshot'

function buildParams({ url, width, height, fullPage, format, quality, adblock }, { cache }) {
  const params = new URLSearchParams({ url, format: format || 'png', cache: cache ? 'true' : 'false' })
  if (width) params.set('width', String(width))
  if (height) params.set('height', String(height))
  if (fullPage) params.set('full_page', 'true')
  if (format && format !== 'png' && quality) params.set('quality', String(Math.min(quality, 100)))
  if (adblock !== undefined) {
    params.set('block_ads', String(adblock))
    params.set('block_cookie_banners', String(adblock))
  }
  return params
}

async function timedFetch(params, apiKey) {
  const start = performance.now()
  const response = await fetch(`${ENDPOINT}?${params}`, { headers: { 'X-API-Key': apiKey } })
  const buffer = Buffer.from(await response.arrayBuffer())
  const duration = performance.now() - start
  if (!response.ok) throw new Error(`SnapRender ${response.status}: ${buffer.toString('utf8').slice(0, 200)}`)
  return { duration, buffer }
}

export default {
  name: 'SnapRender',
  slug: 'snaprender',
  website: 'https://snap-render.com',
  requiresKey: true,

  // deviceScaleFactor is not a SnapRender parameter: captures run at 1x unless a device preset is used.
  async capture({ url, width, height, fullPage, format, quality = 100, adblock, cache: useCache = false }) {
    const apiKey = process.env.SNAPRENDER_API_KEY
    const opts = { url, width, height, fullPage, format, quality, adblock }

    const cold = await timedFetch(buildParams(opts, { cache: false }), apiKey)

    let cachedDuration = null
    if (useCache) {
      await timedFetch(buildParams(opts, { cache: true }), apiKey) // fill the cache
      const cached = await timedFetch(buildParams(opts, { cache: true }), apiKey)
      cachedDuration = cached.duration
    }

    return {
      coldDuration: cold.duration,
      cachedDuration,
      imageBuffer: cold.buffer,
      imageSize: cold.buffer.length
    }
  }
}
