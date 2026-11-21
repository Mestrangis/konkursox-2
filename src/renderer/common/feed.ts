// Captura en vivo de la ventana configurada (Discord) mediante getDisplayMedia.
// El proceso main responde a la petición con la ventana guardada (setDisplayMediaRequestHandler).
import type { CaptureHealth } from '../../shared/types'

/** Si no llegan fotogramas nuevos en este tiempo, damos la captura por perdida (minimizada). */
const STALE_MS = 2500

export class CaptureFeed {
  readonly video: HTMLVideoElement
  private stream: MediaStream | null = null
  private sourceId: string | null = null
  private lastFrame = 0
  private health: CaptureHealth = 'idle'
  private watchdog: number
  private generation = 0
  onHealth: (h: CaptureHealth, error?: string) => void = () => {}
  onFrame: () => void = () => {}

  constructor() {
    this.video = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
    this.video.autoplay = true
    // Fuera de la vista pero en el DOM, para que Chromium siga decodificando.
    Object.assign(this.video.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0.01', pointerEvents: 'none' })
    document.body.append(this.video)
    this.watchdog = window.setInterval(() => this.check(), 500)
  }

  get width(): number {
    return this.video.videoWidth
  }
  get height(): number {
    return this.video.videoHeight
  }
  get status(): CaptureHealth {
    return this.health
  }
  get currentSource(): string | null {
    return this.sourceId
  }
  get ready(): boolean {
    return this.health === 'ok' && this.video.videoWidth > 0
  }

  private setHealth(h: CaptureHealth, error?: string): void {
    if (h === this.health && !error) return
    this.health = h
    this.onHealth(h, error)
  }

  /** Arranca (o reinicia) la captura de la fuente indicada. */
  async start(sourceId: string | null): Promise<void> {
    const gen = ++this.generation
    this.stopStream()
    this.sourceId = sourceId
    if (!sourceId) {
      this.setHealth('idle')
      return
    }
    this.setHealth('starting')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: { frameRate: { ideal: 30, max: 30 }, width: { max: 3840 }, height: { max: 2160 }, cursor: 'never' } as MediaTrackConstraints
      })
      if (gen !== this.generation) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      this.stream = stream
      const track = stream.getVideoTracks()[0]
      track.addEventListener('ended', () => {
        if (gen === this.generation) this.setHealth('lost', 'La ventana capturada se ha cerrado')
      })
      this.video.srcObject = stream
      this.lastFrame = performance.now()
      await this.video.play().catch(() => undefined)
      this.loopFrames(gen)
    } catch (err) {
      if (gen === this.generation) this.setHealth('lost', `No se pudo capturar la ventana: ${(err as Error).message ?? err}`)
    }
  }

  private loopFrames(gen: number): void {
    const v = this.video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }
    const tick = () => {
      if (gen !== this.generation) return
      this.lastFrame = performance.now()
      if (this.health !== 'ok' && this.video.videoWidth > 0) this.setHealth('ok')
      this.onFrame()
      v.requestVideoFrameCallback!(tick)
    }
    v.requestVideoFrameCallback!(tick)
  }

  private check(): void {
    if (!this.stream) return
    const track = this.stream.getVideoTracks()[0]
    if (!track || track.readyState === 'ended') {
      this.setHealth('lost', 'La ventana capturada se ha cerrado')
      return
    }
    if ((this.health === 'ok' || this.health === 'starting') && performance.now() - this.lastFrame > STALE_MS) {
      this.setHealth('lost', 'Sin imagen: ¿Discord está minimizado?')
    }
  }

  get ended(): boolean {
    const track = this.stream?.getVideoTracks()[0]
    return !track || track.readyState === 'ended'
  }

  private stopStream(): void {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.video.srcObject = null
  }

  dispose(): void {
    this.generation++
    window.clearInterval(this.watchdog)
    this.stopStream()
    this.video.remove()
  }
}

/** Reconexión automática: si la ventana se cerró (track terminado), busca de nuevo Discord cada pocos segundos. */
export function autoReconnect(feed: CaptureFeed, getSourceId: () => string | null): () => void {
  let busy = false
  const id = window.setInterval(async () => {
    if (busy || feed.status !== 'lost' || !feed.ended) return
    busy = true
    try {
      const resolved = await window.konk.resolveSource()
      // Si la fuente cambió, el cambio de estado reinicia la captura; si es la misma, reintentamos aquí.
      if (resolved && resolved === getSourceId()) await feed.start(resolved)
    } finally {
      busy = false
    }
  }, 3000)
  return () => window.clearInterval(id)
}
