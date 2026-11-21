// Motor de audio del panel: una pista de música (con fundidos y fundido cruzado) + efectos superpuestos.
const mediaUrl = (kind: 'musica' | 'efectos', file: string) => `konk-media://audio/${kind}/${encodeURIComponent(file)}`

interface Voice {
  el: HTMLAudioElement
  name: string
  fade: number | null
}

/** Rampa lineal de volumen en `seconds`. Devuelve una promesa que se resuelve al terminar. */
function ramp(v: Voice, to: number, seconds: number): Promise<void> {
  if (v.fade !== null) cancelAnimationFrame(v.fade)
  const from = v.el.volume
  const dur = Math.max(0, seconds) * 1000
  if (dur === 0) {
    v.el.volume = to
    v.fade = null
    return Promise.resolve()
  }
  const t0 = performance.now()
  return new Promise((res) => {
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur)
      v.el.volume = Math.min(1, Math.max(0, from + (to - from) * k))
      if (k < 1) v.fade = requestAnimationFrame(step)
      else {
        v.fade = null
        res()
      }
    }
    v.fade = requestAnimationFrame(step)
  })
}

export class AudioEngine {
  musicVolume = 0.8
  sfxVolume = 0.9
  fadeSeconds = 1.5
  loop = true
  private music: Voice | null = null
  private sfx = new Set<HTMLAudioElement>()
  onChange: () => void = () => {}

  get playing(): string | null {
    return this.music?.name ?? null
  }

  get progress(): { current: number; duration: number } {
    const el = this.music?.el
    return { current: el?.currentTime ?? 0, duration: el && Number.isFinite(el.duration) ? el.duration : 0 }
  }

  /** Reproduce una pista con fundido de entrada; si ya suena otra, fundido cruzado. */
  async playMusic(file: string): Promise<void> {
    const old = this.music
    const el = new Audio(mediaUrl('musica', file))
    el.loop = this.loop
    el.volume = 0
    const voice: Voice = { el, name: file, fade: null }
    this.music = voice
    el.addEventListener('ended', () => {
      if (this.music === voice) {
        this.music = null
        this.onChange()
      }
    })
    try {
      await el.play()
    } catch (err) {
      console.error('[audio] no se pudo reproducir', file, err)
      if (this.music === voice) this.music = old
      this.onChange()
      return
    }
    this.onChange()
    void ramp(voice, this.musicVolume, this.fadeSeconds)
    if (old) void this.fadeOutAndStop(old)
  }

  /** Para la música con fundido de salida. */
  async stopMusic(): Promise<void> {
    const v = this.music
    this.music = null
    this.onChange()
    if (v) await this.fadeOutAndStop(v)
  }

  private async fadeOutAndStop(v: Voice): Promise<void> {
    await ramp(v, 0, this.fadeSeconds)
    v.el.pause()
    v.el.src = ''
  }

  setMusicVolume(vol: number): void {
    this.musicVolume = vol
    if (this.music) void ramp(this.music, vol, 0.15)
  }

  setLoop(loop: boolean): void {
    this.loop = loop
    if (this.music) this.music.el.loop = loop
  }

  playSfx(file: string): void {
    const el = new Audio(mediaUrl('efectos', file))
    el.volume = this.sfxVolume
    this.sfx.add(el)
    el.addEventListener('ended', () => this.sfx.delete(el))
    el.play().catch((err) => {
      console.error('[audio] efecto', file, err)
      this.sfx.delete(el)
    })
  }

  stopSfx(): void {
    for (const el of this.sfx) {
      el.pause()
      el.src = ''
    }
    this.sfx.clear()
  }

  /** Corta todo con fundido (botón de pánico). */
  async stopAll(): Promise<void> {
    this.stopSfx()
    await this.stopMusic()
  }
}
