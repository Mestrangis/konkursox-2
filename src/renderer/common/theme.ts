// Aplica el tema del plató (variables CSS --k-...) al documento. El panel no usa estas variables,
// así que en el panel solo cambian las vistas previas del plató.
let applied: string | null = null
let keys: string[] = []

export function applyTheme(id: string | undefined): void {
  const want = id || 'clasico'
  if (applied === want) return
  applied = want
  void window.konk.themeGet(want).then((t) => {
    if (applied !== want) return
    const root = document.documentElement
    for (const k of keys) root.style.removeProperty(k)
    keys = Object.keys(t?.vars ?? {})
    for (const k of keys) root.style.setProperty(k, t!.vars[k])
  })
}

/** Vuelve a leer el tema (tras editar los archivos). */
export function reloadTheme(id: string | undefined): void {
  applied = null
  applyTheme(id)
}
