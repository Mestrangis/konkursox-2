// Llevar el concurso a otro ordenador: exportar todo, importar y borrar los datos de este ordenador.
import { askConfirm, btn, h, openDialog, type Ctx } from './ui'

const mb = (b: number) =>
  b >= 1e9
    ? `${(b / 1e9).toFixed(1).replace('.', ',')} GB`
    : `${Math.max(0.1, b / 1e6)
        .toFixed(1)
        .replace('.', ',')} MB`
const when = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

/** Aviso que no se puede cerrar mientras se trabaja (exportar o importar puede tardar con muchos vídeos). */
function busy(text: string): () => void {
  const back = h('div', 'dlg-back ui', { zIndex: 9999 })
  back.append(
    h('div', 'dlg pnl', { width: '420px', alignItems: 'center', textAlign: 'center', gap: 12 }, [
      h('div', 'spin'),
      h('b', '', { fontSize: 15 }, [text]),
      h('span', 'mut', { fontSize: 12 }, ['No cierres el programa.'])
    ])
  )
  document.body.append(back)
  return () => back.remove()
}

export async function exportFlow(ctx: Ctx): Promise<void> {
  const size = await window.konk.portableSize()
  const ok = await askConfirm(
    'Exportar todo',
    `Se guarda en un único archivo .konkursox: toda la carpeta Documentos\\KONKURSOX (${size.files} archivos, ${mb(size.bytes)}: preguntas, imágenes, audio, multimedia, temas) y toda la configuración (ajustes, concursantes, personas, sonidos, comodines, plano por defecto) incluida la clave del mando. Guárdalo en sitio seguro: con la clave, cualquiera puede usar tu cuenta de Ably.`,
    'Elegir dónde guardarlo'
  )
  if (!ok) return
  const done = busy('Exportando el concurso…')
  try {
    const r = await window.konk.portableExport()
    done()
    if (!r) return
    await openDialog('Concurso exportado', (close) => [
      h('span', '', { fontSize: 13, lineHeight: '1.45' }, [
        `${r.files} archivos (${mb(r.bytes)}) y la configuración${r.hasKey ? ', con la clave del mando' : ' (sin clave del mando: no había ninguna)'}.`
      ]),
      h('code', '', { fontSize: 12, wordBreak: 'break-all' }, [r.file]),
      h('span', 'mut', { fontSize: 12 }, ['En el otro ordenador: instala KONKURSOX y, al abrirlo, elige "Importar desde un archivo" (o Ajustes → Programa → Importar).']),
      h('div', 'dlg-actions', {}, [btn('Mostrar en la carpeta', () => void window.konk.portableShowFile(r.file), 'b'), btn('Cerrar', close, 'b acc')])
    ])
  } catch (err) {
    done()
    ctx.toast(`No se pudo exportar: ${String((err as Error).message ?? err)}`)
  }
}

export async function importFlow(ctx: Ctx): Promise<boolean> {
  const r = await window.konk.portableChooseImport()
  if (!r) return false
  if ('error' in r) {
    ctx.toast(r.error)
    return false
  }
  const i = r.info
  const hasHere = r.here.files > 0
  const ok = await askConfirm(
    'Importar el concurso',
    `Archivo del ${when(i.createdAt)} (versión ${i.appVersion}): ${i.files} archivos, ${mb(i.bytes)}${i.hasKey ? ', con la clave del mando' : ''}. ` +
      (hasHere
        ? `Se SUSTITUYE todo lo de este ordenador: la carpeta ${r.docs} (${r.here.files} archivos ahora) y toda la configuración, también la clave del mando. Lo de ahora se pierde (si lo quieres, exporta antes). `
        : 'Se copia todo en este ordenador. ') +
      'Después el programa se reinicia.',
    hasHere ? 'Sustituir e importar' : 'Importar',
    hasHere
  )
  if (!ok) return false
  const done = busy('Importando el concurso…')
  const err = await window.konk.portableImport(r.file)
  // si todo va bien el programa se reinicia y esto no llega a ejecutarse
  done()
  if (err) ctx.toast(`No se pudo importar: ${err}`)
  return !err
}

/** Borrar mis datos: hay que escribir BORRAR. */
export async function wipeFlow(): Promise<void> {
  await openDialog(
    'Borrar mis datos de este ordenador',
    (close) => {
      const input = h('input', 'inp', { textTransform: 'uppercase' })
      input.placeholder = 'Escribe BORRAR'
      input.autocomplete = 'off'
      const go = btn(
        'Borrar todo y reiniciar',
        async () => {
          if (input.value.trim().toUpperCase() !== 'BORRAR') return
          go.disabled = true
          busy('Borrando los datos…')
          await window.konk.portableWipe()
        },
        'b danger-solid'
      )
      go.disabled = true
      input.oninput = () => (go.disabled = input.value.trim().toUpperCase() !== 'BORRAR')
      return [
        h('span', '', { fontSize: 13, lineHeight: '1.45' }, [
          'Se elimina la carpeta Documentos\\KONKURSOX (preguntas, imágenes, audio, multimedia, temas), toda la configuración del programa y la clave del mando, y se desconecta el móvil. El programa queda como recién instalado. No se puede deshacer: si quieres conservarlo, exporta antes.'
        ]),
        h('span', 'mut', { fontSize: 12 }, ['Para confirmar, escribe BORRAR:']),
        input,
        h('div', 'dlg-actions', {}, [btn('Cancelar', close, 'b ghost'), go])
      ]
    },
    500
  )
}

/** Primera vez en este ordenador: ofrecer importar un concurso. */
export async function firstRunWelcome(ctx: Ctx): Promise<void> {
  if (!(await window.konk.firstRun())) return
  await openDialog(
    'Bienvenido a KONKURSOX',
    (close) => [
      h('span', '', { fontSize: 13, lineHeight: '1.45' }, [
        '¿Traes un concurso de otro ordenador? Si exportaste uno (archivo .konkursox), impórtalo y tendrás aquí todas tus preguntas, multimedia, ajustes y el mando.'
      ]),
      h('div', 'dlg-actions', {}, [
        btn('Empezar de cero', close, 'b ghost'),
        btn(
          'Importar desde un archivo',
          async () => {
            close()
            await importFlow(ctx)
          },
          'b acc'
        )
      ])
    ],
    480
  )
  void window.konk.firstRunDone()
}
