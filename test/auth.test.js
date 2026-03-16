const test = require('node:test')
const assert = require('node:assert/strict')

const { signToken } = require('../src/utils/jwt')
const { requireAuth, requireRole } = require('../src/middleware/auth')

test('requireAuth deve validar token bearer', () => {
  process.env.JWT_SECRET = 'test-secret'
  const token = signToken({ sub: 'admin', role: 'admin' }, process.env.JWT_SECRET, 60)
  const req = { headers: { authorization: `Bearer ${token}` } }

  const payload = requireAuth(req)
  assert.equal(payload.sub, 'admin')
  assert.equal(payload.role, 'admin')
})

test('requireRole deve rejeitar role sem permissao', () => {
  process.env.JWT_SECRET = 'test-secret'
  const token = signToken({ sub: 'cliente', role: 'user' }, process.env.JWT_SECRET, 60)
  const req = { headers: { authorization: `Bearer ${token}` } }

  assert.throws(
    () => requireRole(req, 'admin'),
    (error) => error.statusCode === 403 && error.message === 'Sem permissao para esta operacao.',
  )
})
