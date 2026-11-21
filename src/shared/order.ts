import { CONTESTANT_IDS, type ContestantId, type GameState } from './types'

/** Orden de concursantes en pantalla. En equipos: primero el equipo izquierdo, luego el derecho. */
export function contestantOrder(state: Pick<GameState, 'layout' | 'contestants'>): ContestantId[] {
  if (state.layout !== 'teams') return [...CONTESTANT_IDS]
  const left = state.contestants.filter((c) => c.team === 0).map((c) => c.id)
  const right = state.contestants.filter((c) => c.team === 1).map((c) => c.id)
  // Siempre 2 por lado: si un equipo tiene 3, el sobrante pasa al hueco libre del otro.
  const l = left.slice(0, 2)
  const r = right.slice(0, 2)
  const rest = [...left, ...right].filter((id) => !l.includes(id) && !r.includes(id))
  while (l.length < 2 && rest.length) l.push(rest.shift()!)
  while (r.length < 2 && rest.length) r.push(rest.shift()!)
  return [...l, ...r]
}

/** Cuántos concursantes juegan según la plantilla (la cabecera cuenta como 4). */
export function playerCount(layout: GameState['layout']): number {
  switch (layout) {
    case 'solo':
      return 1
    case 'duo':
      return 2
    case 'trio':
      return 3
    default:
      return 4
  }
}

/** Concursantes de un turno (un equipo son sus dos miembros). */
export function targetMembers(
  state: Pick<GameState, 'layout' | 'contestants'>,
  t: { kind: 'contestant'; id: ContestantId } | { kind: 'team'; index: 0 | 1 } | null | undefined
): ContestantId[] {
  if (!t) return []
  if (t.kind === 'contestant') return [t.id]
  return contestantOrder(state).filter((id) => state.contestants.find((c) => c.id === id)?.team === t.index)
}
