const { createHmac, timingSafeEqual } = require('node:crypto')

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function fromBase64Url(input) {
  const padded = input + '==='.slice((input.length + 3) % 4)
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64').toString('utf8')
}

function signToken(payload, secret, expiresInSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  }

  const encodedHeader = toBase64Url(JSON.stringify(header))
  const encodedPayload = toBase64Url(JSON.stringify(fullPayload))
  const data = `${encodedHeader}.${encodedPayload}`
  const signature = createHmac('sha256', secret).update(data).digest('base64url')

  return `${data}.${signature}`
}

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token ausente.')
  }

  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Token malformado.')

  const [encodedHeader, encodedPayload, signature] = parts
  const data = `${encodedHeader}.${encodedPayload}`
  const expected = createHmac('sha256', secret).update(data).digest('base64url')

  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Assinatura invalida.')
  }

  const header = JSON.parse(fromBase64Url(encodedHeader))
  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new Error('Cabecalho JWT invalido.')
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload))
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || now >= payload.exp) {
    throw new Error('Token expirado.')
  }

  return payload
}

module.exports = {
  signToken,
  verifyToken,
}
