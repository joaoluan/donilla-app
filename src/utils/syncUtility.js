/**
 * Sincronização e mutual exclusion utilities para operações concorrentes
 */

/**
 * Simples mutex usando Promises - garante que apenas uma operação roda por vez
 * Útil para operações em memory Maps que podem ter race conditions
 */
class Mutex {
  constructor() {
    this.locked = false
    this.waitQueue = []
  }

  async lock() {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true
        resolve()
      } else {
        this.waitQueue.push(resolve)
      }
    })
  }

  unlock() {
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift()
      resolve()
    } else {
      this.locked = false
    }
  }

  async runExclusive(fn) {
    await this.lock()
    try {
      return await fn()
    } finally {
      this.unlock()
    }
  }
}

/**
 * Map de mutexes por chave - permite sincronizar operações por chave individual
 * Exemplo: sincronizar todas as operações para um phone específico
 */
class KeyedMutexMap {
  constructor() {
    this.mutexes = new Map()
  }

  getMutex(key) {
    if (!this.mutexes.has(key)) {
      this.mutexes.set(key, new Mutex())
    }
    return this.mutexes.get(key)
  }

  async runExclusive(key, fn) {
    const mutex = this.getMutex(key)
    return mutex.runExclusive(fn)
  }

  /** Limpa mutex para uma chave (chame ao remover item do Map principal) */
  clearMutex(key) {
    this.mutexes.delete(key)
  }
}

/**
 * Timer com garantia de cleanup - retorna um objeto que pode ser cancelado
 */
class ManagedTimer {
  constructor(fn, delayMs) {
    this.timeoutId = null
    this.isCleared = false
    this.fn = fn

    this.timeoutId = setTimeout(async () => {
      if (!this.isCleared) {
        try {
          await fn()
        } catch (error) {
          // Erros em timers devem ser logados mas não propagados
          console.error('[ManagedTimer] Erro em timer:', error?.message || error)
        }
      }
    }, delayMs)
  }

  cancel() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.isCleared = true
      this.timeoutId = null
    }
  }
}

/**
 * Interval com garantia de cleanup
 */
class ManagedInterval {
  constructor(fn, intervalMs) {
    this.intervalId = null
    this.isCleared = false

    this.intervalId = setInterval(async () => {
      if (!this.isCleared) {
        try {
          await fn()
        } catch (error) {
          console.error('[ManagedInterval] Erro em interval:', error?.message || error)
        }
      }
    }, intervalMs)
  }

  cancel() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.isCleared = true
      this.intervalId = null
    }
  }
}

module.exports = {
  Mutex,
  KeyedMutexMap,
  ManagedTimer,
  ManagedInterval,
}
