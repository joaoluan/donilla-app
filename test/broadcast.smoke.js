const { chromium } = require('playwright')

function buildUrl(baseUrl, pagePath) {
  return new URL(pagePath, baseUrl).toString()
}

function uniqueName(prefix, kind) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  return `${prefix}-${kind}-${stamp}`
}

async function waitForDialogClosed(page, selector, timeout = 10000) {
  await page.waitForFunction((dialogSelector) => {
    const dialog = document.querySelector(dialogSelector)
    return Boolean(dialog) && !dialog.hasAttribute('open')
  }, selector, { timeout })
}

async function acceptConfirmation(page, trigger) {
  const nativeDialogPromise = page.waitForEvent('dialog', { timeout: 750 })
    .then(async (dialog) => {
      await dialog.accept()
      return true
    })
    .catch(() => false)

  await trigger()

  const appConfirmDialog = page.locator('#broadcastConfirmDialog')

  try {
    await appConfirmDialog.waitFor({ state: 'visible', timeout: 750 })
    await page.click('#broadcastConfirmSubmitBtn')
    await waitForDialogClosed(page, '#broadcastConfirmDialog')
    return
  } catch {}

  await nativeDialogPromise
}

async function runBroadcastSmoke() {
  const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
  const pagePath = process.env.SMOKE_PATH || '/admin/disparos'
  const adminUsername = process.env.SMOKE_ADMIN_USERNAME || ''
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || ''
  const smokePrefix = process.env.SMOKE_PREFIX || 'SMOKE-BROADCAST'
  const smokePhone = process.env.SMOKE_TEST_PHONE || '5511999999999'
  const url = buildUrl(baseUrl, pagePath)

  if (!adminUsername || !adminPassword) {
    throw new Error('SMOKE_ADMIN_USERNAME e SMOKE_ADMIN_PASSWORD sao obrigatorios para o smoke test.')
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const consoleErrors = []
  const pageErrors = []
  const requestFailures = []

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
    requestFailures.push(`${request.method()} ${request.url()} => ${reason}`)
  })

  const result = {
    url,
    loginWorked: false,
    broadcastViewLoaded: false,
    listCreated: false,
    memberAdded: false,
    memberRemoved: false,
    importClientsWorked: false,
    listDeleted: false,
    templateCreated: false,
    campaignScheduled: false,
    campaignCanceled: false,
    campaignDeleteBlockedListCleanly: false,
    campaignDeleted: false,
    originalListDeletedAfterCampaignRemoval: false,
    consoleErrors,
    pageErrors,
    requestFailures,
    smokePrefix,
  }

  const listName = uniqueName(smokePrefix, 'lista')
  const listDeleteName = uniqueName(smokePrefix, 'lista-delete')
  const templateName = uniqueName(smokePrefix, 'template')
  const campaignName = uniqueName(smokePrefix, 'campanha')
  const memberName = uniqueName(smokePrefix, 'contato')
  const unexpectedConsoleErrors = () => consoleErrors.filter((message) => !/409 \(Conflict\)/i.test(message))

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

    await page.fill('#loginUsername', adminUsername)
    await page.fill('#loginPassword', adminPassword)
    await page.click('#loginSubmitBtn')

    await page.waitForFunction(() => {
      const layout = document.querySelector('#adminLayout')
      const loginCard = document.querySelector('#loginCard')
      return layout && !layout.classList.contains('logged-out') && loginCard && loginCard.classList.contains('hidden')
    }, { timeout: 30000 })
    result.loginWorked = true

    await page.waitForSelector('#broadcast:not(.hidden)', { timeout: 30000 })
    result.broadcastViewLoaded = true

    await page.click('#broadcastNewListBtn')
    await page.waitForSelector('#broadcastListDialog[open]', { timeout: 10000 })
    await page.fill('#broadcastListForm input[name="name"]', listName)
    await page.fill('#broadcastListForm textarea[name="description"]', 'Lista temporaria do smoke test do modulo de disparos.')
    await page.click('#broadcastListForm button[type="submit"]')
    await waitForDialogClosed(page, '#broadcastListDialog')
    await page.waitForFunction((expectedName) => {
      return Array.from(document.querySelectorAll('#broadcastListsGrid .broadcast-list-card h4'))
        .some((node) => node.textContent.trim() === expectedName)
    }, listName, { timeout: 30000 })
    result.listCreated = true

    await page.click('#broadcastAddMemberBtn')
    await page.waitForSelector('#broadcastMemberDialog[open]', { timeout: 10000 })
    await page.fill('#broadcastMemberForm input[name="phone"]', smokePhone)
    await page.fill('#broadcastMemberForm input[name="name"]', memberName)
    await page.click('#broadcastMemberForm button[type="submit"]')
    await waitForDialogClosed(page, '#broadcastMemberDialog')
    await page.waitForFunction((expectedName) => {
      return Array.from(document.querySelectorAll('#broadcastMembersList tbody tr strong'))
        .some((node) => node.textContent.trim() === expectedName)
    }, memberName, { timeout: 30000 })
    result.memberAdded = true

    await acceptConfirmation(page, () => page.click('#broadcastMembersList button[data-broadcast-remove-member]'))
    await page.waitForFunction((expectedName) => {
      return !Array.from(document.querySelectorAll('#broadcastMembersList tbody tr strong'))
        .some((node) => node.textContent.trim() === expectedName)
    }, memberName, { timeout: 30000 })
    result.memberRemoved = true

    await acceptConfirmation(page, () => page.click('#broadcastImportClientsBtn'))
    await page.waitForFunction(() => {
      const status = document.querySelector('#broadcastMembersStatus')
      return status && /importado\(s\)/i.test(status.textContent)
    }, { timeout: 30000 })
    result.importClientsWorked = true

    await page.click('#broadcastNewListBtn')
    await page.waitForSelector('#broadcastListDialog[open]', { timeout: 10000 })
    await page.fill('#broadcastListForm input[name="name"]', listDeleteName)
    await page.fill('#broadcastListForm textarea[name="description"]', 'Lista temporaria para testar exclusao no smoke.')
    await page.click('#broadcastListForm button[type="submit"]')
    await waitForDialogClosed(page, '#broadcastListDialog')
    await page.waitForFunction((expectedName) => {
      return Array.from(document.querySelectorAll('#broadcastListsGrid .broadcast-list-card h4'))
        .some((node) => node.textContent.trim() === expectedName)
    }, listDeleteName, { timeout: 30000 })

    const deleteCard = page.locator('#broadcastListsGrid .broadcast-list-card').filter({ hasText: listDeleteName })
    await acceptConfirmation(page, () => deleteCard.locator('button[data-broadcast-delete-list]').click())
    await page.waitForFunction((expectedName) => {
      return !Array.from(document.querySelectorAll('#broadcastListsGrid .broadcast-list-card h4'))
        .some((node) => node.textContent.trim() === expectedName)
    }, listDeleteName, { timeout: 30000 })
    result.listDeleted = true

    await page.click('[data-broadcast-tab="templates"]')
    await page.click('#broadcastNewTemplateBtn')
    await page.waitForSelector('#broadcastTemplateDialog[open]', { timeout: 10000 })
    await page.fill('#broadcastTemplateForm input[name="name"]', templateName)
    await page.fill('#broadcastTemplateForm textarea[name="content"]', 'Mensagem temporaria do smoke test.')
    await page.click('#broadcastTemplateForm button[type="submit"]')
    await waitForDialogClosed(page, '#broadcastTemplateDialog')
    await page.waitForFunction((expectedName) => {
      return Array.from(document.querySelectorAll('#broadcastTemplatesGrid .broadcast-template-card h4'))
        .some((node) => node.textContent.trim() === expectedName)
    }, templateName, { timeout: 30000 })
    result.templateCreated = true

    await page.click('[data-broadcast-tab="compose"]')
    await page.fill('#broadcastCampaignForm input[name="name"]', campaignName)
    const listOptionValue = await page.$eval('#broadcastCampaignList', (select, expectedName) => {
      const option = Array.from(select.options).find((item) => item.textContent.trim().startsWith(expectedName))
      return option ? option.value : ''
    }, listName)
    if (!listOptionValue) {
      throw new Error('A lista criada nao apareceu no select da campanha.')
    }
    await page.selectOption('#broadcastCampaignList', listOptionValue)
    await page.click('#broadcastUseTemplateBtn')
    await page.waitForSelector('#broadcastTemplatePickerDialog[open]', { timeout: 10000 })
    await page.locator('.broadcast-template-picker-item').filter({
      hasText: templateName,
    }).locator('[data-broadcast-pick-template]').click()

    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000)
    const localDateTime = new Date(scheduledAt.getTime() - scheduledAt.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    await page.fill('#broadcastCampaignScheduledAt', localDateTime)
    await page.click('#broadcastCampaignForm button[type="submit"]')
    await page.waitForFunction(() => {
      const status = document.querySelector('#broadcastCampaignFormStatus')
      return status && /agendada com sucesso/i.test(status.textContent)
    }, { timeout: 30000 })
    await page.waitForSelector('#broadcastCampaignsTable tbody tr', { timeout: 30000 })
    await page.waitForFunction((expectedName) => {
      return Array.from(document.querySelectorAll('#broadcastCampaignsTable tbody tr'))
        .some((row) => row.textContent.includes(expectedName))
    }, campaignName, { timeout: 30000 })
    result.campaignScheduled = true

    await page.click('[data-broadcast-tab="lists"]')
    const createdListCard = page.locator('#broadcastListsGrid .broadcast-list-card').filter({ hasText: listName })
    await acceptConfirmation(page, () => createdListCard.locator('button[data-broadcast-delete-list]').click())
    await page.waitForFunction((expectedName) => {
      const status = document.querySelector('#broadcastListsStatus')
      const stillExists = Array.from(document.querySelectorAll('#broadcastListsGrid .broadcast-list-card h4'))
        .some((node) => node.textContent.trim() === expectedName)
      return status
        && /campanhas? relacionadas primeiro/i.test(status.textContent)
        && stillExists
    }, listName, { timeout: 30000 })
    result.campaignDeleteBlockedListCleanly = true

    await page.click('[data-broadcast-tab="campaigns"]')
    await acceptConfirmation(page, () => page.locator('#broadcastCampaignsTable tbody tr').filter({
      hasText: campaignName,
    }).locator('button[data-broadcast-cancel-campaign]').click())
    await page.waitForFunction(() => {
      const status = document.querySelector('#broadcastCampaignsStatus')
      return status && /voltou para rascunho/i.test(status.textContent)
    }, { timeout: 30000 })
    result.campaignCanceled = true

    await acceptConfirmation(page, () => page.locator('#broadcastCampaignsTable tbody tr').filter({
      hasText: campaignName,
    }).locator('button[data-broadcast-delete-campaign]').click())
    await page.waitForFunction((expectedName) => {
      return !Array.from(document.querySelectorAll('#broadcastCampaignsTable tbody tr'))
        .some((row) => row.textContent.includes(expectedName))
    }, campaignName, { timeout: 30000 })
    result.campaignDeleted = true

    await page.click('[data-broadcast-tab="lists"]')
    await acceptConfirmation(page, () => page.locator('#broadcastListsGrid .broadcast-list-card').filter({
      hasText: listName,
    }).locator('button[data-broadcast-delete-list]').click())
    await page.waitForFunction((expectedName) => {
      return !Array.from(document.querySelectorAll('#broadcastListsGrid .broadcast-list-card h4'))
        .some((node) => node.textContent.trim() === expectedName)
    }, listName, { timeout: 30000 })
    result.originalListDeletedAfterCampaignRemoval = true

    if (unexpectedConsoleErrors().length || pageErrors.length || requestFailures.length) {
      throw new Error('A pagina emitiu erros no navegador durante o smoke test.')
    }

    if (
      !result.loginWorked
      || !result.broadcastViewLoaded
      || !result.listCreated
      || !result.memberAdded
      || !result.memberRemoved
      || !result.importClientsWorked
      || !result.listDeleted
      || !result.templateCreated
      || !result.campaignScheduled
      || !result.campaignCanceled
      || !result.campaignDeleteBlockedListCleanly
      || !result.campaignDeleted
      || !result.originalListDeletedAfterCampaignRemoval
    ) {
      throw new Error('Uma ou mais validacoes do smoke test de disparos falharam.')
    }

    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    result.error = error.message
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

if (require.main === module) {
  runBroadcastSmoke().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { runBroadcastSmoke }
