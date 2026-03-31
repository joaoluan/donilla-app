/**
 * Utilities para retry com exponential backoff
 */

/**
 * Executa uma função com retry automático
 * @param {Function} fn - Função assíncrona a executar
 * @param {Object} options - Opções de retry
 * @param {number} options.maxAttempts - Número máximo de tentativas (default: 3)
 * @param {number} options.initialDelayMs - Delay inicial (default: 1000)
 * @param {number} options.maxDelayMs - Delay máximo (default: 30000)
 * @param {Function} options.logger - Logger (default: console)
 * @param {string} options.context - Contexto para logs (default: "Operation")
 * @returns {Promise} Resultado da função
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    logger = console,
    context = 'Operation',
  } = options

  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt === maxAttempts) {
        // Última tentativa falhou
        logger.error?.(`[CRITICAL] ${context} falhou após ${maxAttempts} tentativas:`, {
          context,
          attempt,
          maxAttempts,
          errorMessage: error?.message || String(error),
          errorCode: error?.code,
          timestamp: new Date().toISOString(),
        })
        throw error
      }

      // Calcular delay com exponential backoff
      const delayMs = Math.min(
        initialDelayMs * Math.pow(2, attempt - 1),
        maxDelayMs
      )

      logger.warn?.(`[RETRY] ${context} falhou na tentativa ${attempt}/${maxAttempts}:`, {
        context,
        attempt,
        delay: `${delayMs}ms`,
        error: error?.message,
      })

      // Aguardar antes de retry
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  // Nunca deve chegar aqui, mas por segurança:
  throw lastError || new Error(`${context} falhou após ${maxAttempts} tentativas`)
}

/**
 * Executa uma função em background com retry automático
 * Útil para webhooks e eventos que não podem bloquear a resposta
 */
function scheduleWithRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    logger = console,
    context = 'Background Task',
  } = options

  // Não bloqueia - roda em background
  setImmediate(async () => {
    try {
      await retryWithBackoff(fn, {
        maxAttempts,
        logger,
        context,
      })
    } catch (error) {
      // Erro já foi logado em retryWithBackoff
      // Aqui apenas prevenimos que o erro não tratado crash a app
      logger.error?.(`[UNHANDLED] ${context} esgotou tentativas`, error?.message)
    }
  })
}

module.exports = {
  retryWithBackoff,
  scheduleWithRetry,
}
