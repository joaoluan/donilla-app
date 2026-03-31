/**
 * Map sincronizado para evitar race conditions
 * Wrapper em torno de Map que usa mutexes por chave
 */

const { KeyedMutexMap } = require('./syncUtility')

class SynchedMap {
  constructor(name = 'SynchedMap') {
    this.map = new Map()
    this.mutexes = new KeyedMutexMap()
    this.name = name
  }

  /**
   * Obtém valor de forma síncrona (sem lock)
   * Use apenas para leituras rápidas que não afetam decisões críticas
   */
  get(key) {
    return this.map.get(key)
  }

  /**
   * Obtém valor de forma sincronizada (com lock)
   * Use para operações que dependem de valores críticos
   */
  async getSafe(key) {
    return this.mutexes.runExclusive(key, () => {
      return this.map.get(key)
    })
  }

  /**
   * Define valor de forma sincronizada
   */
  async set(key, value) {
    return this.mutexes.runExclusive(key, () => {
      this.map.set(key, value)
    })
  }

  /**
   * Deleta valor de forma sincronizada
   */
  async delete(key) {
    return this.mutexes.runExclusive(key, () => {
      const existed = this.map.has(key)
      if (existed) {
        this.map.delete(key)
        this.mutexes.clearMutex(key)
      }
      return existed
    })
  }

  /**
   * Operação atômica: get-or-create
   */
  async getOrCreate(key, factory) {
    return this.mutexes.runExclusive(key, async () => {
      let value = this.map.get(key)
      if (!value) {
        value = await factory()
        this.map.set(key, value)
      }
      return value
    })
  }

  /**
   * Operação atômica: check-and-set
   * Retorna true se conseguiu fazer set, false se já existia
   */
  async setIfAbsent(key, value) {
    return this.mutexes.runExclusive(key, () => {
      if (this.map.has(key)) {
        return false
      }
      this.map.set(key, value)
      return true
    })
  }

  /**
   * Operação atômica: update
   */
  async update(key, updateFn) {
    return this.mutexes.runExclusive(key, () => {
      const oldValue = this.map.get(key)
      const newValue = updateFn(oldValue)
      if (newValue !== undefined) {
        this.map.set(key, newValue)
      } else {
        this.map.delete(key)
      }
      return newValue
    })
  }

  /**
   * Limpar todo o map
   */
  async clear() {
    for (const key of this.map.keys()) {
      await this.delete(key)
    }
  }

  /**
   * Próxima operação em exclusão com todos os acessos sincronizados
   */
  async forEach(fn) {
    const entries = Array.from(this.map.entries())
    for (const [key, value] of entries) {
      await this.mutexes.runExclusive(key, async () => {
        const currentValue = this.map.get(key)
        if (currentValue !== undefined) {
          await fn(currentValue, key)
        }
      })
    }
  }

  has(key) {
    return this.map.has(key)
  }

  size() {
    return this.map.size
  }

  keys() {
    return this.map.keys()
  }

  values() {
    return this.map.values()
  }

  entries() {
    return this.map.entries()
  }
}

module.exports = { SynchedMap }
