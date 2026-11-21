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
- Audio: música (fundido de entrada/salida y fundido cruzado) y efectos. Carpeta por defecto `Documentos\KONKURSOX\audio\` con subcarpetas `musica\` y `efectos\` (la primera vez se copian unos efectos de ejemplo de `resources/audio`). Formatos: mp3, wav, ogg, m4a, aac, flac, opus, webm.

## Desarrollo

Requisitos: Node 24+ (npm 11) y Windows (la captura de ventanas está pensada para Windows).

```powershell
npm install
npm run dev        # Electron con recarga en caliente
npm run typecheck  # tsc sin emitir
npm test           # tests de la lógica de recorte (vitest)
npm run dist       # instalador local en release\ (sin publicar)
```

Estructura:

```
src/main/        proceso main: store, ventanas, captura, audio (protocolo konk-media://), updater
src/preload/     API segura expuesta como window.konk
src/shared/      tipos, reducer del estado, geometría de plantillas, lógica de recorte (crop.ts)
src/renderer/    plato.html + panel.html, ds/ (design system), plato/ (escenas), panel/ (UI, calibración, audio)
tests/           tests de crop.ts
design/          diseño de referencia (export de Claude Design)
legacy/          preguntas del concurso antiguo
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
