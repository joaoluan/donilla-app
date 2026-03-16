const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto')

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') return false

  const parts = storedHash.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false

  const [, salt, hash] = parts
  const hashBuffer = Buffer.from(hash, 'hex')
  const verifyBuffer = scryptSync(password, salt, 64)

  if (hashBuffer.length !== verifyBuffer.length) return false
  return timingSafeEqual(hashBuffer, verifyBuffer)
}

module.exports = {
  hashPassword,
  verifyPassword,
}
