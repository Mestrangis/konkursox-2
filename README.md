# KONKURSOX REMAKE

Remake desde cero del concurso de TV casero. App de escritorio (Electron + Vite + TypeScript, renderer en TS/HTML/CSS sin frameworks) con dos ventanas:

- **Plató**: lienzo 1920x1080 escalado, sin marco, a pantalla completa en el monitor que elijas. Es lo que se comparte por Discord. Estética de `design/KONKURSOX 2.html` (marino y oro).
- **Panel del presentador**: ventana normal en el otro monitor. Estilo gris oscuro neutro propio, calcado de `design/panel.html`.

El estado vive **solo en el proceso main** (`src/main/store.ts`): los renderers mandan acciones por IPC y reciben el estado completo. Se guarda en `%APPDATA%\KONKURSOX\konkursox-state.json`: si cierras a media partida, al abrir sigues donde estabas.

## Cómo se usa

### Escenas (lo que sale en el plató)

Arriba del panel, la barra **En el aire**: Cabecera (F1), Cámaras (F2), Juego (F3), Marcador (F4) y Clasificación final (F5). El plató pinta **solo** la escena en el aire. Cambiar de escena **no borra ni reinicia nada**: puedes ir a Cabecera a mitad de pregunta y volver con F3 tal cual estaba. Navegar por el panel tampoco cambia el plató.

La escena **Juego** enseña el juego que tiene el indicador **AIRE** en la navegación. Un juego se pone en el aire al dar su primer paso visible (por ejemplo "Mostrar pregunta" o "Empezar el rosco"). Cada juego guarda su propia pregunta en curso: trabajar en uno no toca los demás.

**Escena Cámaras**: interruptores de quién sale (presentador y cada concursante). El plató se reparte solo para 1-5 personas, con el presentador en medio cuando hay concursantes a ambos lados. Opciones de nombres, puntos y transición (corte o fundido).

### Juegos

Tipo test, Sí o no, Escalera, Estimación, ¿Quién lo dijo? y Rosco. Cada pantalla tiene un **botón grande con el siguiente paso** (Espacio) y lo que viene después, controles secundarios debajo y **Deshacer** (Ctrl+Z), que deshace el último paso de ese juego.

- **Test / Sí o no / ¿Quién lo dijo?**: por turno, "todos responden" o rebote al siguiente si falla. A-D marca la respuesta (en "todos responden" se asigna al concursante seleccionado y salta al siguiente).
- **Escalera**: 15 escalones (seguros en 5, 10 y 15; se cambian en Ajustes), comodines 50:50 (F), llamada (L) y público (U), plantarse (X), pantalla final.
- **Estimación**: escribes la cifra de cada uno, revelado con recta animada, precio justo opcional y puntos al más cercano o escalonados.
- **Rosco**: 1 o 2 concursantes, cada uno con su rosco y su reloj. A acierto, F fallo, Espacio pasapalabra, P pausa el reloj, Tab cambia el turno.

### Biblioteca

Cada tipo de juego tiene sus bancos en su carpeta: `Documentos\KONKURSOX\preguntas\<tipo>\` (`test`, `sino`, `escalera`, `estimacion`, `quien`, `rosco`). El editor del panel permite crear, editar, duplicar, eliminar, marcar sin usar y poner imagen; el del rosco es una cuadrícula de 27 letras con **Importar desde texto** (`A: definición = RESPUESTA`, `Ñ (contiene): ... = ...`). Todo se guarda solo. Un banco eliminado va a `preguntas\_papelera\`.

Los bancos de versiones anteriores (mezclados en `preguntas\`) se reparten por tipo al arrancar y los originales se guardan en `preguntas\_antiguos\`. Un rosco con varias definiciones por letra se parte en varios roscos.

### Audio (siempre a la derecha)

Reproductor de la carpeta `Documentos\KONKURSOX\audio\musica\` (play/pausa, anterior/siguiente, barra para saltar, volumen, bucle y fundido). Arrastra canciones a la lista para añadirlas. Botonera de 9 efectos: clic derecho en un botón para elegir su sonido. Interruptor de **sonidos automáticos** del juego (cuáles suenan en cada momento, en Ajustes).

### Atajos

| Dónde | Tecla | Qué hace |
| --- | --- | --- |
| Siempre | F1-F5 | Escenas |
| Siempre | F6 / F7 / F8 | Cámaras: solo yo / solo el del turno / todos (y pone la escena Cámaras) |
| Siempre | Ctrl+1..9 | Efectos |
| Siempre | Ctrl+Espacio / Ctrl+F | Música: play-pausa / fundido |
| Siempre | Ctrl+Z | Deshacer el último paso del juego |
| Pantalla de juego | Espacio | Siguiente paso |
| Test, Sí o no, Escalera, ¿Quién lo dijo? | A-D, O, T, R, I | Marcar, ocultar/mostrar opciones, temporizador, rebote, imagen |
| Estimación | C, T | Mostrar cifras en el plató, temporizador |
| Rosco | A, F, Espacio, P, Tab | Acierto, fallo, pasapalabra, reloj, cambiar turno |

Ningún atajo se dispara mientras escribes en un campo de texto.

### Cámaras desde Discord

Se captura solo la ventana de Discord (Windows Graphics Capture: funciona aunque esté tapada). En **Cámaras → Calibrar recuadros** dibujas un recuadro por cámara; se guardan en coordenadas relativas, así que mover o redimensionar Discord no los descuadra. En **Concursantes** eliges qué cámara corresponde a cada uno. Si Discord se minimiza o se cierra, los marcos muestran la silueta y la navegación avisa; si Discord se reabre, se reconecta solo.

## Desarrollo

Requisitos: Node 24+ (npm 11) y Windows (la captura de ventanas está pensada para Windows).

```powershell
npm install
npm run dev        # Electron con recarga en caliente
npm run typecheck  # tsc sin emitir
npm test           # tests de la lógica (vitest)
npm run dist       # instalador local en release\ (sin publicar)
```

Estructura:

```
src/main/        proceso main: store (y deshacer), ventanas, captura, biblioteca, audio (konk-media://), updater
src/preload/     API segura expuesta como window.konk
src/shared/      estado y reducers: escenas (scene.ts), preguntas (quiz.ts), rosco, juegos, biblioteca, recorte
src/renderer/    plato.html + panel.html
  ds/            design system del plató (tokens, fuentes, componentes)
  plato/         escenas del plató
  panel/         panel: chrome.ts (barra, navegación, dock), screens/ (cada pantalla), audio, calibración
tests/           recorte, escalera, puntuación, rosco, estimación, clasificación, escenas y migración
design/          diseños de referencia (exports de Claude Design)
legacy/          preguntas e imágenes del concurso antiguo
```

Para depurar el plató sin que ocupe un monitor entero, activa **En ventana** en Ajustes.

## Sacar una release

1. Sube la versión en `package.json` (por ejemplo `0.5.0`) y haz commit.
2. Crea y sube el tag con el mismo número:

   ```powershell
   git tag v0.5.0
   git push origin main --tags
   ```

3. La GitHub Action `.github/workflows/release.yml` compila en `windows-latest`, pasa typecheck y tests, y publica `KONKURSOX-Setup-x.y.z.exe` + `latest.yml` en GitHub Releases.

Las instalaciones existentes se actualizan solas (electron-updater): descargan la nueva versión en segundo plano y la instalan al cerrar, o al pulsar *Reiniciar y actualizar* en Ajustes.

El instalador no está firmado: la primera vez Windows SmartScreen puede avisar ("Más información" > "Ejecutar de todas formas").
