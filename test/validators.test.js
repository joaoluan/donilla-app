const test = require('node:test')
const assert = require('node:assert/strict')

const { AppError } = require('../src/utils/errors')
const {
  validateCreateCategoria,
  validateUpdateCategoria,
} = require('../src/validators/categoriasValidator')
const {
  validateCreateProduto,
  validateUpdateProduto,
} = require('../src/validators/produtosValidator')
const {
  parseCategoriasListQuery,
  parseProdutosListQuery,
} = require('../src/validators/listQueryValidator')
const {
  parseDashboardQuery,
  parseOrdersQuery,
  parseCustomersQuery,
  parseCustomerId,
} = require('../src/validators/adminQueryValidator')
const {
  parseOrderId,
  validateCustomerLookup,
  validateCreateOrder,
  validateCreateCustomer,
  validateUpdateOrderStatus,
} = require('../src/validators/publicOrderValidator')
const { validateUpdateStoreSettings } = require('../src/validators/storeSettingsValidator')
const {
  validateCreateDeliveryFee,
  validateUpdateDeliveryFee,
} = require('../src/validators/deliveryFeeValidator')
const { resolveDeliveryFee } = require('../src/utils/deliveryFees')

function mockUrl(pathAndQuery) {
  return new URL(pathAndQuery, 'http://localhost')
}

test('validateCreateCategoria deve aceitar payload valido', () => {
  const data = validateCreateCategoria({ nome: 'Doces', ordem_exibicao: '2' })
  assert.deepEqual(data, { nome: 'Doces', ordem_exibicao: 2 })
})

test('validateUpdateCategoria deve rejeitar payload vazio', () => {
  assert.throws(
    () => validateUpdateCategoria({}),
    (error) => error instanceof AppError && error.message === 'Informe ao menos um campo para atualizar.',
  )
})

test('validateCreateProduto deve converter tipos validos', () => {
  const data = validateCreateProduto({
    categoria_id: '1',
    nome_doce: 'Bolo de Pote',
    preco: '18.9',
    ativo: 'true',
  })

  assert.equal(data.categoria_id, 1)
  assert.equal(data.preco, 18.9)
  assert.equal(data.ativo, true)
})

test('validateUpdateProduto deve rejeitar preco invalido', () => {
  assert.throws(
    () => validateUpdateProduto({ preco: 'abc' }),
    (error) => error instanceof AppError && error.message === 'preco invalido.',
  )
})

test('parseCategoriasListQuery deve aplicar defaults', () => {
  const query = parseCategoriasListQuery(mockUrl('/categorias'))
  assert.deepEqual(query, {
    page: 1,
    pageSize: 10,
    order: 'asc',
    sort: 'id',
  })
})

test('parseProdutosListQuery deve parsear filtros', () => {
  const query = parseProdutosListQuery(
    mockUrl('/produtos?page=2&pageSize=5&categoria_id=1&ativo=false&search=bolo&sort=preco&order=desc'),
  )

  assert.deepEqual(query, {
    page: 2,
    pageSize: 5,
    categoria_id: 1,
    ativo: false,
    search: 'bolo',
    sort: 'preco',
    order: 'desc',
    disponibilidade: 'all',
  })
})

test('parseDashboardQuery deve aplicar periodo padrao', () => {
  const query = parseDashboardQuery(mockUrl('/admin/dashboard'))

  assert.deepEqual(query, {
    period: 'today',
  })
})

test('parseOrdersQuery deve parsear filtros de listagem', () => {
  const query = parseOrdersQuery(
    mockUrl('/admin/orders?page=3&pageSize=20&status=entregue&search=maria&period=30d'),
  )

  assert.deepEqual(query, {
    page: 3,
    pageSize: 20,
    status: 'entregue',
    search: 'maria',
    period: '30d',
  })
})

test('parseOrdersQuery deve aceitar periodo de pedidos do dia', () => {
  const query = parseOrdersQuery(mockUrl('/admin/orders?period=today'))

  assert.deepEqual(query, {
    page: 1,
    pageSize: 10,
    status: 'all',
    period: 'today',
  })
})

test('parseOrdersQuery deve aceitar timestamps exatos enviados pela interface', () => {
  const query = parseOrdersQuery(
    mockUrl('/admin/orders?period=today&from=2026-03-25&to=2026-03-25&fromAt=2026-03-25T03:00:00.000Z&toAt=2026-03-26T02:59:59.999Z'),
  )

  assert.deepEqual(query, {
    page: 1,
    pageSize: 10,
    status: 'all',
    period: 'today',
    from: '2026-03-25',
    to: '2026-03-25',
    fromAt: '2026-03-25T03:00:00.000Z',
    toAt: '2026-03-26T02:59:59.999Z',
  })
})

test('parseOrdersQuery deve rejeitar periodo customizado sem datas', () => {
  assert.throws(
    () => parseOrdersQuery(mockUrl('/admin/orders?period=custom')),
    (error) => error instanceof AppError && error.message === 'Informe ao menos uma data para o periodo personalizado.',
  )
})

test('parseCustomersQuery deve aplicar defaults da carteira CRM', () => {
  const query = parseCustomersQuery(mockUrl('/admin/customers'))

  assert.deepEqual(query, {
    period: 'all',
    page: 1,
    pageSize: 12,
    segment: 'all',
    sort: 'recent_desc',
  })
})

test('parseCustomersQuery deve parsear filtros da carteira CRM', () => {
  const query = parseCustomersQuery(
    mockUrl('/admin/customers?page=2&pageSize=20&segment=recorrente&sort=recent_desc&search=maria&period=30d'),
  )

  assert.deepEqual(query, {
    page: 2,
    pageSize: 20,
    segment: 'recorrente',
    sort: 'recent_desc',
    search: 'maria',
    period: '30d',
  })
})

test('parseDashboardQuery deve rejeitar intervalo invertido', () => {
  assert.throws(
    () => parseDashboardQuery(mockUrl('/admin/dashboard?period=custom&from=2026-03-11&to=2026-03-01')),
    (error) => error instanceof AppError && error.message === 'A data inicial deve ser menor ou igual a data final.',
  )
})

test('parseCustomerId deve rejeitar ids invalidos', () => {
  assert.throws(
    () => parseCustomerId('abc'),
    (error) => error instanceof AppError && error.message === 'ID de cliente invalido.',
  )
})

test('parseOrderId deve rejeitar ids com sufixo invalido', () => {
  assert.throws(
    () => parseOrderId('1abc'),
    (error) => error instanceof AppError && error.message === 'ID de pedido invalido.',
  )
})

test('validateCustomerLookup deve aceitar telefone com máscara e normalizar', () => {
  const telefone = validateCustomerLookup(' (11) 9 8888-7777 ')
  assert.equal(telefone, '11988887777')
})

test('validateCustomerLookup deve rejeitar telefone curto', () => {
  assert.throws(
    () => validateCustomerLookup('123'),
    (error) => error instanceof AppError && error.message === 'Telefone invalido.',
  )
})

test('validateCreateOrder deve aceitar observacoes e normalizar vazio para null', () => {
  const data = validateCreateOrder({
    cliente_session_token: 'x'.repeat(20),
    metodo_pagamento: ' PIX ',
    observacoes: '  tirar granulado  ',
    itens: [{ produto_id: 1, quantidade: 2 }],
  })

  assert.equal(data.observacoes, 'tirar granulado')
  assert.equal(data.metodo_pagamento, 'pix')
})

test('validateCreateOrder deve aceitar Asaas Checkout', () => {
  const data = validateCreateOrder({
    cliente_session_token: 'x'.repeat(20),
    metodo_pagamento: ' ASAAS_CHECKOUT ',
    itens: [{ produto_id: 1, quantidade: 1 }],
  })

  assert.equal(data.metodo_pagamento, 'asaas_checkout')
})

test('validateCreateOrder deve descartar campos monetarios enviados pelo cliente', () => {
  const data = validateCreateOrder({
    cliente_session_token: 'x'.repeat(20),
    metodo_pagamento: 'pix',
    itens: [{ produto_id: 1, quantidade: 1 }],
    valor_total: '0.01',
    valor_entrega: '0.01',
    desconto: '50.00',
    status_pagamento: 'pago',
  })

  assert.equal(Object.prototype.hasOwnProperty.call(data, 'valor_total'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(data, 'valor_entrega'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(data, 'desconto'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(data, 'status_pagamento'), false)
})

test('validateCreateOrder deve rejeitar pagamentos invalidos', () => {
  assert.throws(
    () =>
      validateCreateOrder({
        cliente_session_token: 'x'.repeat(20),
        metodo_pagamento: 'cartao',
        itens: [{ produto_id: 1, quantidade: 1 }],
      }),
    (error) => error instanceof AppError && error.message === 'Metodo de pagamento invalido.',
  )
})

test('validateUpdateOrderStatus deve aceitar atualizacao isolada do pagamento', () => {
  const data = validateUpdateOrderStatus({ status_pagamento: 'pago' })

  assert.deepEqual(data, { status_pagamento: 'pago' })
})

test('validateUpdateOrderStatus deve aceitar pedido expirado no payload do admin', () => {
  const data = validateUpdateOrderStatus({ status_entrega: 'cancelado', status_pagamento: 'expirado' })

  assert.deepEqual(data, { status_entrega: 'cancelado', status_pagamento: 'expirado' })
})

test('validateUpdateOrderStatus deve rejeitar payload vazio', () => {
  assert.throws(
    () => validateUpdateOrderStatus({}),
    (error) => error instanceof AppError && error.message === 'Status de pedido invalido.',
  )
})

test('validateCreateCustomer deve aceitar senha forte no cadastro do cliente', () => {
  const data = validateCreateCustomer({
    nome: 'Maria Donilla',
    telefone_whatsapp: '(11) 99999-9999',
    senha: 'Doce123',
    endereco: {
      rua: 'Rua das Flores',
      numero: '20',
      bairro: 'Centro',
      cidade: 'Sapiranga',
    },
  })

  assert.equal(data.telefone_whatsapp, '11999999999')
  assert.equal(data.senha, 'Doce123')
})

test('validateCreateCustomer deve rejeitar senha fraca no cadastro do cliente', () => {
  assert.throws(
    () =>
      validateCreateCustomer({
        nome: 'Maria Donilla',
        telefone_whatsapp: '(11) 99999-9999',
        senha: 'doce12',
        endereco: {
          rua: 'Rua das Flores',
          numero: '20',
          bairro: 'Centro',
          cidade: 'Sapiranga',
        },
      }),
    (error) =>
      error instanceof AppError &&
      error.message === 'A senha deve ter pelo menos 6 caracteres, com 1 letra maiuscula, 1 minuscula e 1 numero.',
  )
})

test('validateUpdateStoreSettings deve aceitar payload valido e normalizar mensagem', () => {
  const data = validateUpdateStoreSettings({
    loja_aberta: 'false',
    tempo_entrega_minutos: '35',
    tempo_entrega_max_minutos: '55',
    taxa_entrega_padrao: '7.5',
    mensagem_aviso: '  ',
  })

  assert.deepEqual(data, {
    loja_aberta: false,
    tempo_entrega_minutos: 35,
    tempo_entrega_max_minutos: 55,
    taxa_entrega_padrao: 7.5,
    mensagem_aviso: null,
  })
})

test('validateUpdateStoreSettings deve aceitar horario automatico semanal', () => {
  const data = validateUpdateStoreSettings({
    horario_automatico_ativo: 'true',
    horario_funcionamento: {
      sunday: { enabled: false, open: '09:00', close: '18:00' },
      monday: { enabled: true, open: '09:00', close: '18:00' },
      tuesday: { enabled: true, open: '09:00', close: '18:00' },
      wednesday: { enabled: true, open: '09:00', close: '18:00' },
      thursday: { enabled: true, open: '09:00', close: '18:00' },
      friday: { enabled: true, open: '09:00', close: '18:00' },
      saturday: { enabled: true, open: '09:00', close: '18:00' },
    },
  })

  assert.equal(data.horario_automatico_ativo, true)
  assert.equal(data.horario_funcionamento.monday.enabled, true)
  assert.equal(data.horario_funcionamento.monday.open, '09:00')
})

test('validateUpdateStoreSettings deve rejeitar horario com abertura e fechamento iguais', () => {
  assert.throws(
    () =>
      validateUpdateStoreSettings({
        horario_funcionamento: {
          sunday: { enabled: false, open: '09:00', close: '18:00' },
          monday: { enabled: true, open: '09:00', close: '09:00' },
          tuesday: { enabled: true, open: '09:00', close: '18:00' },
          wednesday: { enabled: true, open: '09:00', close: '18:00' },
          thursday: { enabled: true, open: '09:00', close: '18:00' },
          friday: { enabled: true, open: '09:00', close: '18:00' },
          saturday: { enabled: true, open: '09:00', close: '18:00' },
        },
      }),
    (error) => error instanceof AppError && error.message === 'O horario de fechamento precisa ser diferente do horario de abertura.',
  )
})

test('validateUpdateStoreSettings deve rejeitar tempo maximo menor que minimo', () => {
  assert.throws(
    () =>
      validateUpdateStoreSettings({
        tempo_entrega_minutos: 60,
        tempo_entrega_max_minutos: 40,
      }),
    (error) => error instanceof AppError && error.message === 'O tempo maximo de entrega deve ser maior ou igual ao minimo.',
  )
})

test('validateUpdateStoreSettings deve rejeitar payload vazio', () => {
  assert.throws(
    () => validateUpdateStoreSettings({}),
    (error) => error instanceof AppError && error.message === 'Informe ao menos um campo para atualizar.',
  )
})

test('validateCreateDeliveryFee deve aceitar cidade inteira', () => {
  const data = validateCreateDeliveryFee({
    bairro: '  ',
    cidade: 'Sapiranga',
    valor_entrega: '40',
    ativo: 'true',
  })

  assert.deepEqual(data, {
    bairro: null,
    cidade: 'Sapiranga',
    valor_entrega: 40,
    ativo: true,
  })
})

test('validateUpdateDeliveryFee deve rejeitar payload vazio', () => {
  assert.throws(
    () => validateUpdateDeliveryFee({}),
    (error) => error instanceof AppError && error.message === 'Informe ao menos um campo para atualizar.',
  )
})

test('resolveDeliveryFee deve priorizar bairro e cidade especificos', () => {
  const result = resolveDeliveryFee(
    { bairro: 'Scharlau', cidade: 'São Leopoldo' },
    [
      { id: 1, cidade: 'São Leopoldo', valor_entrega: '35.00', ativo: true },
      { id: 2, bairro: 'Scharlau', cidade: 'São Leopoldo', valor_entrega: '25.00', ativo: true },
      { id: 3, bairro: 'Scharlau', valor_entrega: '30.00', ativo: true },
    ],
    10,
  )

  assert.equal(result.amount, 25)
  assert.equal(result.matchedRule.id, 2)
  assert.equal(result.source, 'bairro_cidade')
})

test('resolveDeliveryFee deve usar taxa padrao sem correspondencia', () => {
  const result = resolveDeliveryFee({ bairro: 'Desconhecido', cidade: 'Novo Hamburgo' }, [], 9)

  assert.equal(result.amount, 9)
  assert.equal(result.matchedRule, null)
  assert.equal(result.source, 'default')
})
