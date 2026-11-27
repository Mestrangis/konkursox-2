// Qué imagen de la pregunta se ve en el plató y cuándo.
// Orden: primero el texto de la pregunta, nunca la imagen antes. La "imagen" (pista) sale después del texto
// (automática) o cuando la muestras (manual); la "imagen_respuesta" sale al revelar. A mano se puede
// mostrar u ocultar cualquiera en todo momento (pero nunca antes de que se vea el texto).
import type { Question } from './questions'

export interface ImageState {
  phase: 'ready' | 'question' | 'options' | 'locked' | 'rebound' | 'revealed' | string
  question: Pick<Question, 'imagen' | 'imagen_modo' | 'imagen_respuesta'>
  /** null = según la pregunta; true / false = lo has puesto tú */
  showImage: boolean | null
  showAnswerImage?: boolean | null
  imageFull?: boolean
}

export interface ImageView {
  /** archivo que se ve ahora (la de la respuesta manda sobre la de la pregunta) */
  file: string | null
  which: 'q' | 'a' | null
  /** a pantalla completa */
  full: boolean
  qVisible: boolean
  aVisible: boolean
}

const NONE: ImageView = { file: null, which: null, full: false, qVisible: false, aVisible: false }

/** Lo que pediría la pregunta sin tocar nada: la de la pregunta si es automática, la de la respuesta al revelar. */
export function imageIntent(c: ImageState): { q: boolean; a: boolean } {
  return {
    q: c.showImage ?? (c.question.imagen_modo ?? 'auto') === 'auto',
    a: c.showAnswerImage ?? c.phase === 'revealed'
  }
}

export function imageView(c: ImageState | null | undefined): ImageView {
  if (!c) return NONE
  // nunca antes que el texto de la pregunta
  if (c.phase === 'ready') return NONE
  const want = imageIntent(c)
  const qVisible = !!c.question.imagen && want.q
  const aVisible = !!c.question.imagen_respuesta && want.a
  const which = aVisible ? 'a' : qVisible ? 'q' : null
  const file = which === 'a' ? c.question.imagen_respuesta! : which === 'q' ? c.question.imagen! : null
  return { file, which, full: !!c.imageFull && !!file, qVisible, aVisible }
}

/** Mostrar u ocultar a mano una de las dos imágenes. */
export function toggleImage(c: ImageState, which: 'q' | 'a'): Partial<ImageState> {
  const want = imageIntent(c)
  return which === 'q' ? { showImage: !want.q } : { showAnswerImage: !want.a }
}
