const { createHash } = require('node:crypto')

const PRODUCT_IMAGE_ROUTE_PREFIXES = Object.freeze({
  public: '/public/produtos',
  admin: '/produtos',
})

function parseImageDataUrl(dataUrl) {
  const normalized = String(dataUrl || '').trim()
  if (!normalized) return null

  const match = normalized.match(/^data:image\/([a-z0-9.+-]+);base64,(.*)$/i)
  if (!match) return null

  const [, mimeSubtype, base64Payload = ''] = match
  const base64 = base64Payload.replace(/\s/g, '')
  if (!base64) return null

  return {
    mimeSubtype: mimeSubtype.toLowerCase(),
    base64,
    normalized,
  }
}

function buildImageVersion(value) {
  return createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12)
}

function buildProductImagePath(productId, imageUrl, { audience = 'public' } = {}) {
  const parsedId = Number(productId || 0)
  if (!Number.isInteger(parsedId) || parsedId <= 0) return null

  const parsedImage = parseImageDataUrl(imageUrl)
  if (!parsedImage) return null

  const routePrefix = PRODUCT_IMAGE_ROUTE_PREFIXES[audience] || PRODUCT_IMAGE_ROUTE_PREFIXES.public
  return `${routePrefix}/${parsedId}/imagem?v=${buildImageVersion(parsedImage.normalized)}`
}

function buildPublicProductImagePath(productId, imageUrl) {
  return buildProductImagePath(productId, imageUrl, { audience: 'public' })
}

function buildAdminProductImagePath(productId, imageUrl) {
  return buildProductImagePath(productId, imageUrl, { audience: 'admin' })
}

function normalizeCatalogProductImage(product, options = {}) {
  if (!product || typeof product !== 'object') return product

  const imagePath = buildProductImagePath(product.id, product.imagem_url, options)
  return {
    ...product,
    imagem_url: imagePath || product.imagem_url || null,
  }
}

module.exports = {
  parseImageDataUrl,
  buildImageVersion,
  buildProductImagePath,
  buildPublicProductImagePath,
  buildAdminProductImagePath,
  normalizeCatalogProductImage,
}
