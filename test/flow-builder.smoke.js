const { chromium } = require('playwright')

function buildUrl(baseUrl, pagePath) {
  return new URL(pagePath, baseUrl).toString()
}

function uniqueStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

async function acceptNativeDialog(page, trigger) {
  const dialogPromise = page.waitForEvent('dialog', { timeout: 5000 }).then(async (dialog) => {
    await dialog.accept()
  })

  await trigger()
  await dialogPromise
}

async function connectNodes(page, fromSelector, toSelector) {
  const from = await page.locator(fromSelector).boundingBox()
  const to = await page.locator(toSelector).boundingBox()

  if (!from || !to) {
    throw new Error(`Nao foi possivel localizar os pontos de conexao entre ${fromSelector} e ${toSelector}.`)
  }

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()
}

async function runFlowBuilderSmoke() {
  const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3100'
  const pagePath = process.env.SMOKE_PATH || '/admin/bot-whatsapp/fluxos'
  const adminUsername = process.env.SMOKE_ADMIN_USERNAME || ''
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || ''
  const creationMode = process.env.SMOKE_FLOW_CREATION_MODE === 'legacy'
    ? 'legacy'
    : process.env.SMOKE_FLOW_CREATION_MODE === 'starter'
      ? 'starter'
      : 'blank'
  const smokePrefix = process.env.SMOKE_PREFIX || 'SMOKE-FLOW'
  const url = buildUrl(baseUrl, pagePath)

  if (!adminUsername || !adminPassword) {
    throw new Error('SMOKE_ADMIN_USERNAME e SMOKE_ADMIN_PASSWORD sao obrigatorios para o smoke test.')
  }

  const smokeName = `${smokePrefix}-${uniqueStamp()}`
  const smokeTrigger = `oi-${uniqueStamp().toLowerCase()}`
  const smokeMessage = 'Olá! Este fluxo foi salvo pelo smoke test do Flow Builder.'

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const consoleErrors = []
  const pageErrors = []
  const requestFailures = []
  const ignoredRequestFailures = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText || 'failed'
    const failureEntry = `${request.method()} ${request.url()} => ${reason}`
    const isBenignAbort = reason === 'net::ERR_ABORTED' && request.method() === 'GET'

    if (isBenignAbort) {
      ignoredRequestFailures.push(failureEntry)
      return
    }

    requestFailures.push(failureEntry)
  })

  const result = {
    url,
    loginWorked: false,
    adminLoaded: false,
    flowListLoaded: false,
    flowCreated: false,
    editorLoaded: false,
    messageNodeAdded: false,
    triggerConnectedToMessage: false,
    messageConnectedToEnd: false,
    autoLayoutWorked: false,
    starterTemplateLoaded: creationMode !== 'starter',
    legacyTemplateLoaded: creationMode !== 'legacy',
    flowSaved: false,
    flowPublished: false,
    flowListedAsPublished: false,
    flowUnpublished: false,
    flowDeleted: false,
    consoleErrors,
    pageErrors,
    requestFailures,
    ignoredRequestFailures,
    creationMode,
    smokeName,
    smokeTrigger,
  }

  try {
    await page.goto(buildUrl(baseUrl, '/admin'), { waitUntil: 'domcontentloaded', timeout: 30000 })

    await page.fill('#loginUsername', adminUsername)
    await page.fill('#loginPassword', adminPassword)
    await page.click('#loginSubmitBtn')

    await page.waitForFunction(() => {
      const layout = document.querySelector('#adminLayout')
      const loginCard = document.querySelector('#loginCard')
      return layout && !layout.classList.contains('logged-out') && loginCard && loginCard.classList.contains('hidden')
    }, { timeout: 30000 })
    result.loginWorked = true

    await page.waitForSelector('a[href="/admin/bot-whatsapp"]', { timeout: 15000 })
    result.adminLoaded = true

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('#newFlowBtn', { timeout: 15000 })
    await page.waitForFunction(() => {
      const status = document.querySelector('#flowsPageStatus')
      return Boolean(status && /carregado|fluxo/i.test(status.textContent))
    }, { timeout: 30000 })
    result.flowListLoaded = true

    await page.click(
      creationMode === 'legacy'
        ? '#importLegacyFlowBtn'
        : creationMode === 'starter'
          ? '#newStarterFlowBtn'
          : '#newFlowBtn',
    )
    await page.waitForSelector('#newFlowDialog[open]', { timeout: 10000 })
    await page.fill('#newFlowName', smokeName)
    await page.fill('#newFlowTrigger', smokeTrigger)
    await page.click('#newFlowForm button[type="submit"]')

    await page.waitForURL(/\/admin\/bot-whatsapp\/fluxos\/editor\?id=\d+/, { timeout: 30000 })
    result.flowCreated = true

    await page.waitForFunction(() => {
      const status = document.querySelector('#builderPageStatus')
      return Boolean(status && /pronto para edi..o/i.test(status.textContent))
    }, { timeout: 30000 })
    result.editorLoaded = true

    if (creationMode === 'legacy') {
      await page.waitForSelector('#builderTemplateNotice:not(.hidden)', { timeout: 10000 })
      await page.waitForSelector('[data-node-id="order_lookup_current"]', { timeout: 10000 })
      await page.waitForSelector('[data-node-id="menu_has_order"]', { timeout: 10000 })
      result.legacyTemplateLoaded = true

      await page.click('[data-node-id="message_legacy_intro"]')
      await page.fill('#inspectorNodeContent', `${smokeMessage}\n\nTemplate legado importado no smoke test.`)
    } else if (creationMode === 'starter') {
      await page.waitForSelector('#builderTemplateNotice:not(.hidden)', { timeout: 10000 })
      await page.waitForSelector('[data-node-id="menu_commercial_main"]', { timeout: 10000 })
      await page.waitForSelector('[data-node-id="input_sales_need"]', { timeout: 10000 })
      result.starterTemplateLoaded = true

      await page.click('[data-node-id="message_commercial_intro"]')
      await page.fill('#inspectorNodeContent', `${smokeMessage}\n\nTemplate comercial importado no smoke test.`)
    } else {
      await page.click('[data-block-type="message"]')
      await page.waitForSelector('.flow-node[data-type="message"]', { timeout: 10000 })
      result.messageNodeAdded = true

      await page.click('.flow-node[data-type="message"]')
      await page.fill('#inspectorNodeContent', smokeMessage)

      await connectNodes(
        page,
        '[data-node-id="trigger_1"] [data-port-key="next"]',
        '.flow-node[data-type="message"] .node-port-input',
      )
      result.triggerConnectedToMessage = true

      await connectNodes(
        page,
        '.flow-node[data-type="message"] [data-port-key="next"]',
        '[data-node-id="end_1"] .node-port-input',
      )
      result.messageConnectedToEnd = true
    }

    await page.click('#builderAutoLayoutBtn')
    await page.waitForFunction(() => {
      const status = document.querySelector('#builderPageStatus')
      const nodeCount = document.querySelectorAll('.flow-node').length
      return nodeCount >= 2 && Boolean(status && /layout reorganizado automaticamente/i.test(status.textContent))
    }, { timeout: 15000 })
    result.autoLayoutWorked = true

    await page.click('#builderSaveBtn')
    await page.waitForFunction(() => {
      const status = document.querySelector('#builderPageStatus')
      return Boolean(status && /rascunho salvo com sucesso/i.test(status.textContent))
    }, { timeout: 30000 })
    result.flowSaved = true

    await acceptNativeDialog(page, () => page.click('#builderPublishBtn'))
    await page.waitForFunction(() => {
      const status = document.querySelector('#builderPageStatus')
      return Boolean(status && /publicado/i.test(status.textContent))
    }, { timeout: 30000 })
    result.flowPublished = true

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForFunction((expectedName) => {
      return Array.from(document.querySelectorAll('#flowsTableBody tr'))
        .some((row) => row.textContent.includes(expectedName) && /Publicado/i.test(row.textContent))
    }, smokeName, { timeout: 30000 })
    result.flowListedAsPublished = true

    const row = page.locator('#flowsTableBody tr').filter({ hasText: smokeName })
    await page.waitForTimeout(400)
    await row.locator('[data-flow-action="unpublish"]').click()
    await page.waitForFunction((expectedName) => {
      return Array.from(document.querySelectorAll('#flowsTableBody tr'))
        .some((tableRow) => tableRow.textContent.includes(expectedName) && /Rascunho/i.test(tableRow.textContent))
    }, smokeName, { timeout: 30000 })
    result.flowUnpublished = true

    await acceptNativeDialog(page, () => row.locator('[data-flow-action="delete"]').click())
    await page.waitForFunction((expectedName) => {
      return !Array.from(document.querySelectorAll('#flowsTableBody tr'))
        .some((tableRow) => tableRow.textContent.includes(expectedName))
    }, smokeName, { timeout: 30000 })
    result.flowDeleted = true
  } finally {
    await browser.close()
  }

  if (consoleErrors.length > 0 || pageErrors.length > 0 || requestFailures.length > 0) {
    throw new Error(`Flow Builder smoke encontrou erros.\n${JSON.stringify(result, null, 2)}`)
  }

  const expectedChecks = [
    'loginWorked',
    'adminLoaded',
    'flowListLoaded',
    'flowCreated',
    'editorLoaded',
    'autoLayoutWorked',
    'flowSaved',
    'flowPublished',
    'flowListedAsPublished',
    'flowUnpublished',
    'flowDeleted',
  ]

  if (creationMode === 'legacy') {
    expectedChecks.push('legacyTemplateLoaded')
  } else if (creationMode === 'starter') {
    expectedChecks.push('starterTemplateLoaded')
  } else {
    expectedChecks.push('messageNodeAdded', 'triggerConnectedToMessage', 'messageConnectedToEnd')
  }

  const failed = expectedChecks.filter((key) => !result[key])
  if (failed.length > 0) {
    throw new Error(`Flow Builder smoke falhou nas validacoes: ${failed.join(', ')}.\n${JSON.stringify(result, null, 2)}`)
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

runFlowBuilderSmoke().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`)
  process.exitCode = 1
})
