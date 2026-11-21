# KONKURSOX REMAKE

Remake desde cero del concurso de TV casero. App de escritorio (Electron + Vite + TypeScript, renderer en TS/HTML/CSS sin frameworks) con dos ventanas:

- **Plató**: lienzo 1920x1080 escalado, sin marco, a pantalla completa en el monitor que elijas. Es lo que se comparte por Discord.
- **Panel del presentador**: ventana normal en el otro monitor. Desde aquí se controla todo.

El estado del juego vive **solo en el proceso main** (`src/main/store.ts`): los renderers mandan acciones por IPC y reciben el estado completo. Se guarda en `%APPDATA%\KONKURSOX\konkursox-state.json`.

## Fase 1 (esta versión)

- Plantillas del plató fieles a `design/KONKURSOX 2.html`: cabecera, 1 + presentador, 2, 3, 4 concursantes y equipos 2 contra 2.
- Design system en `src/renderer/ds/`: tokens (CSS variables), fuentes locales (Barlow Condensed, Cinzel, Cormorant Garamond) y componentes (marco de cámara, placa de nombre con puntos, cabecera de equipo, VS, rótulo inferior, barra de pregunta, opciones A-D, temporizador...).
- **Cámaras desde Discord**: se captura solo la ventana de Discord (Windows Graphics Capture, funciona aunque esté tapada). En *Calibrar cámaras* se dibuja un rectángulo por concursante (y presentador) sobre la captura; se guardan en coordenadas relativas, así que mover o redimensionar Discord no los descuadra. El plató pinta cada recorte con `object-fit: cover` centrado en el rectángulo. Si Discord se minimiza o se cierra, los marcos vuelven a la silueta y el panel avisa (botones *Reconectar* / *Recalibrar*); si Discord se reabre, se reconecta solo.
- Panel: concursantes (nombre, equipo, puntos +/- con paso configurable), equipos, rótulo inferior, presentador, selector de monitor del plató (se recuerda), vista previa del plató.
- Audio: música (fundido de entrada/salida y fundido cruzado) y efectos. Carpeta por defecto `Documentos\KONKURSOX\audio\` con subcarpetas `musica\` y `efectos\` (lo que haya en `resources/audio` se copia ahí la primera vez; ahora está vacío). Formatos: mp3, wav, ogg, m4a, aac, flac, opus, webm.

## Fase 2: juegos de preguntas

Pestaña **Preguntas** del panel. El plató pasa solo a la pantalla de pregunta al lanzar una (tecla V para volver a la plantilla).

- **Bancos**: un JSON por banco en `Documentos\KONKURSOX\preguntas\`, imágenes en `preguntas\imagenes\`. En el primer arranque se importan los de `legacy/` (formato antiguo `[{pregunta, opciones[], correcta}]`); el botón *Importar* convierte más archivos (antiguos o nuevos). Las preguntas usadas se recuerdan entre partidas; se puede barajar y buscar.

  ```json
  {
    "formato": "konkursox-banco",
    "version": 1,
    "nombre": "General",
    "preguntas": [
      {
        "id": "1",
        "tipo": "test",
        "enunciado": "¿Cuál es el río más largo del mundo?",
        "opciones": ["Nilo", "Amazonas", "Yangtsé", "Misisipi"],
        "correcta": 1,
        "imagen": "rio.jpg",
        "nota_presentador": "Durante años se dijo que era el Nilo",
        "dificultad": 2,
        "fuente": "National Geographic"
      }
    ]
  }
  ```

  `tipo` es `"test"` (hasta 4 opciones) o `"sino"` (2 opciones). `imagen`, `nota_presentador`, `dificultad` y `fuente` son opcionales.
- **Flujo**: lanzar (Intro / N) → opciones una a una (O) o todas (T) → marcar (1-4 o A-D; naranja con sonido de tensión) → revelar (R) → puntos (automático, o P). Turnos con rebote al siguiente si falla, temporizador opcional (Espacio) con tic-tac, imagen en el plató (I), retirar (Esc).
- **Escalera** (modo Millonario): 15 escalones por defecto con seguros en 5, 10 y 15 (editables), comodines 50:50 (automático, tecla F), llamada y público (a mano; se tachan en el plató), plantarse, fallar (cae al último seguro) y ganar, con pantalla final y sonidos.
- **Puntuación**: puntos por acierto, fallo que resta o no, sumar al revelar o a mano.
- **Sonidos**: cada momento (nueva pregunta, respuesta definitiva, acierto, fallo, reloj, finales de la escalera) se asocia a un archivo de `audio\efectos\` en *Sonidos del juego*.

Todo el estado de la partida (pregunta en curso, escalera, usadas) vive en el proceso main y se guarda: si cierras el programa, al abrirlo sigues donde estabas.

## Desarrollo

Requisitos: Node 24+ (npm 11) y Windows (la captura de ventanas está pensada para Windows).

```powershell
npm install
npm run dev        # Electron con recarga en caliente
npm run typecheck  # tsc sin emitir
npm test           # tests de recorte, escalera y puntuación (vitest)
npm run dist       # instalador local en release\ (sin publicar)
```

Estructura:

```
src/main/        proceso main: store, ventanas, captura, audio (protocolo konk-media://), updater
src/preload/     API segura expuesta como window.konk
src/shared/      tipos, reducer, plantillas, recorte (crop.ts), preguntas y partida (questions.ts, quiz.ts)
src/renderer/    plato.html + panel.html, ds/ (design system), plato/ (escenas), panel/ (UI, calibración, audio)
tests/           tests de recorte, escalera y puntuación
design/          diseño de referencia (export de Claude Design)
legacy/          preguntas e imágenes del concurso antiguo
```

Para depurar el plató sin que ocupe un monitor entero, marca **En ventana** en la cabecera del panel.

## Sacar una release

1. Sube la versión en `package.json` (por ejemplo `0.2.0`) y haz commit.
2. Crea y sube el tag con el mismo número:

   ```powershell
   git tag v0.2.0
   git push origin main --tags
   ```

3. La GitHub Action `.github/workflows/release.yml` compila en `windows-latest`, pasa typecheck y tests, y publica `KONKURSOX-Setup-x.y.z.exe` + `latest.yml` en GitHub Releases.

Las instalaciones existentes se actualizan solas (electron-updater): descargan la nueva versión en segundo plano y la instalan al cerrar, o al pulsar *Reiniciar y actualizar* en el panel.

El instalador no está firmado: la primera vez Windows SmartScreen puede avisar ("Más información" > "Ejecutar de todas formas").
