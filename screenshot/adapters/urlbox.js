import Urlbox from 'urlbox';

function buildOptions(url, opts) {
  const options = {
    url,
    format: opts.format || 'png',
    width: opts.width || 1920,
    height: opts.height || 1080,
    full_page: !!opts.fullPage,
    block_ads: !!opts.adblock
  }

  if (opts.deviceScaleFactor && opts.deviceScaleFactor > 1) {
    options.retina = true
  }

  if (opts.quality && opts.format !== 'png') {
    options.quality = opts.quality
  }

  return options
}

export default {
  name: 'Urlbox',
  slug: 'urlbox',
  website: 'https://urlbox.com',
  requiresKey: true,

  async capture({ url, width, height, fullPage, format, quality = 100, deviceScaleFactor = 1, adblock, cache = false }) {
    const apiKey = process.env.URLBOX_API_KEY
    const apiSecret = process.env.URLBOX_API_SECRET
    const client = Urlbox(apiKey, apiSecret)
    const opts = { width, height, fullPage, format, quality, deviceScaleFactor, adblock }

    const coldRenderUrl = client.generateRenderLink({ ...buildOptions(url, opts), force: true })

    // Cold request: force=true bypasses cache
    const coldStart = performance.now()
    const coldResponse = await fetch(coldRenderUrl)
    const coldDuration = performance.now() - coldStart

    const imageBuffer = Buffer.from(await coldResponse.arrayBuffer())

    const cachedRenderUrl = client.generateRenderLink(buildOptions(url, opts))
    let cachedDuration = null
    if (cache) {
      const cachedStart = performance.now()
      const cachedResponse = await fetch(cachedRenderUrl)
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
