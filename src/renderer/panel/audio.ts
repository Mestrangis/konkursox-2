// Motor de audio del panel: reproductor de música (lista de musica\) + efectos superpuestos + bucle del reloj.
const mediaUrl = (kind: 'musica' | 'efectos', file: string) => `konk-media://audio/${kind}/${encodeURIComponent(file)}`

/** Rampa lineal de volumen. */
function ramp(el: HTMLAudioElement, to: number, seconds: number, token: { id: number }): Promise<void> {
  const my = ++token.id
  const from = el.volume
  const dur = Math.max(0, seconds) * 1000
  if (dur === 0) {
    el.volume = Math.max(0, Math.min(1, to))
    return Promise.resolve()
  }
  const t0 = performance.now()
  return new Promise((res) => {
    const step = () => {
      if (my !== token.id) return res()
      const k = Math.min(1, (performance.now() - t0) / dur)
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k))
      if (k < 1) requestAnimationFrame(step)
      else res()
    }
    requestAnimationFrame(step)
  })
}

export class AudioEngine {
  musicVolume = 0.8
  sfxVolume = 0.9
  fadeSeconds = 3
  loop = true
  /** lista de pistas (archivos de musica\) */
  tracks: string[] = []
  private el: HTMLAudioElement | null = null
  private file: string | null = null
  private fadeToken = { id: 0 }
  private fadingOut = false
  private sfx = new Set<HTMLAudioElement>()
  private loopEl: HTMLAudioElement | null = null
  private loopName: string | null = null
  onChange: () => void = () => {}

  get current(): string | null {
    return this.file
  }
  get playing(): boolean {
    return !!this.el && !this.el.paused && !this.fadingOut
  }
  get position(): { current: number; duration: number } {
    const el = this.el
    return { current: el?.currentTime ?? 0, duration: el && Number.isFinite(el.duration) ? el.duration : 0 }
  }

  /** Carga y reproduce una pista (con fundido de entrada si se pide). */
  async play(file: string, fadeIn = false): Promise<void> {
    this.stopElement()
    const el = new Audio(mediaUrl('musica', file))
    el.loop = this.loop
    el.volume = fadeIn ? 0 : this.musicVolume
    this.el = el
    this.file = file
    this.fadingOut = false
    el.addEventListener('ended', () => {
      if (this.el === el && !this.loop) this.next(false)
    })
    el.addEventListener('pause', () => this.onChange())
    el.addEventListener('play', () => this.onChange())
    el.addEventListener('loadedmetadata', () => this.onChange())
    try {
      await el.play()
      if (fadeIn) await ramp(el, this.musicVolume, this.fadeSeconds, this.fadeToken)
    } catch (err) {
      console.error('[audio] no se pudo reproducir', file, err)
    }
    this.onChange()
  }

  /** Play/pausa (Ctrl+Espacio). Si no hay pista, empieza la primera. */
  toggle(): void {
    if (!this.el) {
      if (this.tracks[0]) void this.play(this.tracks[0])
      return
    }
    if (this.el.paused) {
      this.fadeToken.id++
      this.fadingOut = false
      this.el.volume = this.musicVolume
      void this.el.play()
    } else this.el.pause()
    this.onChange()
  }

  /** Fundido (Ctrl+F): si suena, baja y pausa; si está en pausa, entra con fundido. */
  async fade(): Promise<void> {
    const el = this.el
    if (!el) {
      if (this.tracks[0]) await this.play(this.tracks[0], true)
      return
    }
    if (!el.paused && !this.fadingOut) {
      this.fadingOut = true
      this.onChange()
      await ramp(el, 0, this.fadeSeconds, this.fadeToken)
      if (this.fadingOut && this.el === el) {
        el.pause()
        this.fadingOut = false
      }
    } else {
      this.fadingOut = false
      el.volume = 0
      await el.play().catch(() => undefined)
      await ramp(el, this.musicVolume, this.fadeSeconds, this.fadeToken)
    }
    this.onChange()
  }

  seek(fraction: number): void {
    const el = this.el
    if (!el || !Number.isFinite(el.duration)) return
    el.currentTime = Math.max(0, Math.min(el.duration - 0.05, fraction * el.duration))
    this.onChange()
  }

  next(manual = true): void {
    if (!this.tracks.length) return
    const i = this.file ? this.tracks.indexOf(this.file) : -1
    const n = this.tracks[(i + 1) % this.tracks.length]
    if (!manual && i === this.tracks.length - 1) {
      this.stopElement()
      this.onChange()
      return
    }
    void this.play(n)
  }

  prev(): void {
    if (!this.tracks.length) return
    // como los reproductores: si lleva más de 3 s, vuelve al principio de la misma
    if (this.el && this.el.currentTime > 3) {
      this.el.currentTime = 0
      return
    }
    const i = this.file ? this.tracks.indexOf(this.file) : 0
    void this.play(this.tracks[(i - 1 + this.tracks.length) % this.tracks.length])
  }

  setVolume(v: number): void {
    this.musicVolume = v
    if (this.el && !this.fadingOut) {
      this.fadeToken.id++
      this.el.volume = v
    }
  }

  setLoop(loop: boolean): void {
    this.loop = loop
    if (this.el) this.el.loop = loop
  }

  private stopElement(): void {
    this.fadeToken.id++
    if (this.el) {
      this.el.pause()
      this.el.src = ''
    }
    this.el = null
    this.file = null
    this.fadingOut = false
  }

  // ---- efectos ----
  playSfx(file: string): HTMLAudioElement {
    const el = new Audio(mediaUrl('efectos', file))
    el.volume = this.sfxVolume
    this.sfx.add(el)
    el.addEventListener('ended', () => this.sfx.delete(el))
    el.play().catch((err) => {
      console.error('[audio] efecto', file, err)
      this.sfx.delete(el)
    })
    return el
  }

  stopSfx(): void {
    for (const el of this.sfx) {
      el.pause()
      el.src = ''
    }
    this.sfx.clear()
  }

  // ---- bucle (tic-tac del temporizador) ----
  playLoop(file: string): void {
    if (this.loopName === file && this.loopEl) return
    this.stopLoop()
    const el = new Audio(mediaUrl('efectos', file))
    el.loop = true
    el.volume = this.sfxVolume
    this.loopEl = el
    this.loopName = file
    el.play().catch((err) => console.error('[audio] bucle', file, err))
  }

  stopLoop(): void {
    if (this.loopEl) {
      this.loopEl.pause()
      this.loopEl.src = ''
    }
    this.loopEl = null
    this.loopName = null
  }
}
