const { chromium } = require('playwright')

function buildUrl(baseUrl, pagePath) {
  return new URL(pagePath, baseUrl).toString()
}

async function runCatalogSmoke() {
  const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
  const pagePath = process.env.SMOKE_PATH || '/catalogo'
  const url = buildUrl(baseUrl, pagePath)

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
    loaded: false,
    productCount: 0,
    searchWorked: false,
    addWorked: false,
    quantityIncreaseWorked: false,
    quantityDecreaseWorked: false,
    checkoutBlockedWithoutSession: false,
    chipFeeLoaded: false,
    consoleErrors,
    pageErrors,
    requestFailures,
  }

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('.product-card', { timeout: 30000 })

    result.loaded = true
    result.productCount = await page.locator('.product-card').count()

    const chipFeeText = await page.locator('#chipFee').innerText()
    result.chipFeeLoaded = !chipFeeText.includes('Entrega --') && !chipFeeText.includes('Taxa --')

    const firstProductName = (await page.locator('.product-card h4').first().innerText()).trim()
    const searchTerm = firstProductName.slice(0, Math.min(4, firstProductName.length))
    await page.fill('#searchInput', searchTerm)
    await page.waitForTimeout(350)

    const visibleNames = await page.locator('.product-card h4').allInnerTexts()
    result.searchWorked = visibleNames.length > 0
      && visibleNames.every((name) => name.toLowerCase().includes(searchTerm.toLowerCase()))

    await page.fill('#searchInput', '')
    await page.waitForTimeout(350)

    await page.locator('.product-card button[data-add]').first().click()
    await page.waitForTimeout(250)
    const cartCountAfterAdd = await page.locator('#cartCount').innerText()
    const cartItemsAfterAdd = await page.locator('#cartItems .cart-item').count()
    result.addWorked = cartCountAfterAdd.includes('1 item') && cartItemsAfterAdd === 1

    await page.locator('#cartItems button[data-inc]').first().click()
    await page.waitForTimeout(250)
    const cartCountAfterIncrease = await page.locator('#cartCount').innerText()
    result.quantityIncreaseWorked = cartCountAfterIncrease.includes('2 itens')

    await page.locator('#cartItems button[data-dec]').first().click()
    await page.waitForTimeout(250)
    const cartCountAfterDecrease = await page.locator('#cartCount').innerText()
    result.quantityDecreaseWorked = cartCountAfterDecrease.includes('1 item')

    const checkoutDisabled = await page.locator('#checkoutBtn').isDisabled()
    const orderStatusText = await page.locator('#orderStatus').innerText()
    result.checkoutBlockedWithoutSession = checkoutDisabled && orderStatusText.includes('Sessão não encontrada')

    if (result.productCount < 1) {
      throw new Error('No products were rendered on the catalog page.')
    }
    if (consoleErrors.length || pageErrors.length || requestFailures.length) {
      throw new Error('The page emitted browser errors during the smoke test.')
    }
    if (
      !result.chipFeeLoaded
      || !result.searchWorked
      || !result.addWorked
      || !result.quantityIncreaseWorked
      || !result.quantityDecreaseWorked
      || !result.checkoutBlockedWithoutSession
    ) {
      throw new Error('One or more catalog smoke assertions failed.')
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
  runCatalogSmoke().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = { runCatalogSmoke }
