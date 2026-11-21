// Biblioteca en el panel: lista de bancos por tipo, caché y guardado automático.
import type { LibBankInfo, LibType } from '../../shared/library'
import type { Bank, Question } from '../../shared/questions'

export class LibStore {
  list: LibBankInfo[] = []
  private cache = new Map<string, Bank>()
  private timers = new Map<string, number>()
  private listeners: (() => void)[] = []

  onChange(fn: () => void): void {
    this.listeners.push(fn)
  }
  private emit(): void {
    for (const l of this.listeners) l()
  }

  async refresh(): Promise<void> {
    this.list = await window.konk.libList()
    this.emit()
  }

  banksOf(tipo: LibType): LibBankInfo[] {
    return this.list.filter((b) => b.tipo === tipo)
  }

  info(ref: string | null | undefined): LibBankInfo | undefined {
    return ref ? this.list.find((b) => b.ref === ref) : undefined
  }

  /** Banco en caché (null si aún no se ha leído; se pide en segundo plano). */
  peek(ref: string | null | undefined): Bank | null {
    if (!ref) return null
    const b = this.cache.get(ref)
    if (!b && this.list.some((x) => x.ref === ref)) void this.get(ref)
    return b ?? null
  }

  async get(ref: string): Promise<Bank> {
    const hit = this.cache.get(ref)
    if (hit) return hit
    const b = await window.konk.libGet(ref)
    this.cache.set(ref, b)
    this.emit()
    return b
  }

  /** Cambia un banco y lo guarda solo (con un poco de retraso para no escribir en cada tecla). */
  update(ref: string, bank: Bank): void {
    this.cache.set(ref, bank)
    const i = this.list.findIndex((x) => x.ref === ref)
    if (i >= 0)
      this.list[i] = {
        ...this.list[i],
        nombre: bank.nombre,
        count: bank.preguntas.length,
        used: bank.preguntas.filter((q) => q.usada).length,
        letters: this.list[i].tipo === 'rosco' ? new Set(bank.preguntas.filter((q) => q.enunciado && q.respuesta).map((q) => q.letra)).size : undefined
      }
    const t = this.timers.get(ref)
    if (t) clearTimeout(t)
    this.timers.set(
      ref,
      window.setTimeout(() => {
        this.timers.delete(ref)
        void window.konk.libSave(ref, bank)
      }, 400)
    )
    this.emit()
  }

  /** Marca preguntas como usadas (o sin usar) y lo guarda. */
  markUsed(ref: string, ids: string[], used: boolean): void {
    const b = this.cache.get(ref)
    if (!b) return void window.konk.libMarkUsed(ref, ids, used).then(() => this.refresh())
    const today = new Date().toISOString().slice(0, 10)
    const set = new Set(ids)
    this.update(ref, { ...b, preguntas: b.preguntas.map((q): Question => (set.has(q.id) ? { ...q, usada: used ? today : undefined } : q)) })
  }

  async create(tipo: LibType, nombre: string): Promise<string> {
    const ref = await window.konk.libCreate(tipo, nombre)
    await this.refresh()
    return ref
  }

  async remove(ref: string): Promise<void> {
    await window.konk.libDelete(ref)
    this.cache.delete(ref)
    await this.refresh()
  }
}
