const test = require('node:test')
const assert = require('node:assert/strict')

const { signToken, verifyToken } = require('../src/utils/jwt')

test('signToken/verifyToken deve funcionar com payload valido', () => {
  const token = signToken({ sub: 'admin' }, 'secret', 60)
  const payload = verifyToken(token, 'secret')
  assert.equal(payload.sub, 'admin')
})

test('verifyToken deve falhar com secret incorreto', () => {
  const token = signToken({ sub: 'admin' }, 'secret', 60)
  assert.throws(() => verifyToken(token, 'wrong-secret'))
})

test('verifyToken deve falhar para token expirado', async () => {
  const token = signToken({ sub: 'admin' }, 'secret', 1)
  await new Promise((resolve) => setTimeout(resolve, 1200))
  assert.throws(() => verifyToken(token, 'secret'))
})
