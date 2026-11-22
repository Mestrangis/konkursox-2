# KONKURSOX REMAKE

Remake desde cero del concurso de TV casero. App de escritorio (Electron + Vite + TypeScript, renderer en TS/HTML/CSS sin frameworks) con dos ventanas:

- **Plató**: lienzo 1920x1080 escalado, sin marco, a pantalla completa en el monitor que elijas. Es lo que se comparte por Discord. Estética de `design/KONKURSOX 2.html` (marino y oro).
- **Panel del presentador**: ventana normal en el otro monitor. Estilo gris oscuro neutro propio, calcado de `design/panel.html`.

El estado vive **solo en el proceso main** (`src/main/store.ts`): los renderers mandan acciones por IPC y reciben el estado completo. Se guarda en `%APPDATA%\KONKURSOX\konkursox-state.json`: si cierras a media partida, al abrir sigues donde estabas.

## Cómo se usa

### Escenas (lo que sale en el plató)

Arriba del panel, la barra **En el aire**: Cabecera (F1), Cámaras (F2), Juego (F3), Marcador (F4), Clasificación final (F5) y Multimedia (F9). El plató pinta **solo** la escena en el aire. Cambiar de escena **no borra ni reinicia nada**: puedes ir a Cabecera a mitad de pregunta y volver con F3 tal cual estaba. Navegar por el panel tampoco cambia el plató.

La escena **Juego** enseña el juego que tiene el indicador **AIRE** en la navegación. Se elige con el desplegable del botón Juego, con el botón **Poner en el aire** de cada pantalla de juego, o al dar su primer paso visible (por ejemplo "Mostrar pregunta" o "Empezar el rosco"). Cada juego guarda su propia pregunta en curso: trabajar en uno no toca los demás.

**Quién sale**: fila fija bajo la barra En el aire con un interruptor por persona (presentador y cada concursante), en cualquier combinación. Vale para las escenas Cámaras y Juego: el plató se reparte solo para 1-5 personas, con el presentador en medio cuando hay concursantes a ambos lados. F6/F7/F8 son atajos de esa fila (solo yo / solo el del turno / todos). Si calibras una cámara **Público** (un recuadro más en la calibración, opcional) aparece en la fila como otro interruptor. La segunda línea de la fila tiene el **Plano** de la escena Juego (vale para cualquier juego): **Juego** (lo normal, Ctrl+F1), **Cámaras + datos** (las cámaras ocupan casi todo y abajo un widget sin fondo con los datos: rosco, escalera o marcador; Ctrl+F2) y **Cámaras limpias** (a pantalla completa, sin marcos y solo el nombre; Ctrl+F3), y el interruptor **Rótulo inferior**. En la misma fila eliges cómo sales tú: **igual** que los demás, **destacado** (tú grande y los concursantes más pequeños) o **en una esquina** (pequeño y superpuesto, eligiendo la esquina). En la pantalla Cámaras, **Distribución** permite usar las plantillas del diseño del plató (1 + presentador, 2, 3, 4 y 2 contra 2 con el VS, esta solo con equipos) en vez del reparto automático; también están las opciones de nombres, puntos y transición (corte o fundido) y, como secundario, la calibración.

**Multimedia (F9)**: en la sección Multimedia organizas imágenes y vídeos en carpetas (`Documentos\KONKURSOX\multimedia\`): arrástralos desde el ordenador o pega un enlace de YouTube (coge miniatura y título). Clic en uno lo saca a pantalla completa en el plató; los vídeos se controlan desde el panel (play/pausa con Espacio, barra, volumen) y el sonido sale por el plató. Si un vídeo de YouTube no permite incrustarse, el panel avisa. F9 muestra/oculta al instante y al ocultar vuelve a la escena anterior. La imagen de una pregunta se manda aquí con **Imagen a Multimedia**.

### Juegos

Tipo test, Sí o no, Escalera, Estimación, ¿Quién lo dijo? y Rosco. Cada pantalla tiene un **botón grande con el siguiente paso** (Espacio) y lo que viene después, controles secundarios debajo y **Deshacer** (Ctrl+Z), que deshace el último paso de ese juego.

- **Test / Sí o no / ¿Quién lo dijo?**: por turno, "todos responden" o rebote al siguiente si falla. Flujo: las opciones se muestran **de una en una** con Espacio (el botón dice "Mostrar opción B"...; al lado, "Mostrar todas"), **Marcar** (A-D o clic en la opción: queda en naranja en el plató como respuesta definitiva, se puede cambiar o desmarcar con Retroceso), Revelar y Siguiente. En "todos responden" cada marca se asigna al concursante seleccionado y salta al siguiente. Con un solo concursante no se puede elegir turno, todos responden ni rebote. Una pregunta cuenta como **usada al revelarla** (no al cargarla); en la lista, ↺ o clic derecho la desmarca y "Reiniciar usadas" desmarca todo el banco. Se guarda en el propio banco.
- **Temporizador** (en todos los juegos de preguntas y en Estimación): independiente, nunca arranca solo. T lo muestra u oculta en el plató (aunque esté corriendo), Y arranca o pausa, y "Reiniciar". En Ajustes solo se elige la duración.
- **Escalera**: con **Preparar preguntas** eliges preguntas de cualquier banco de Tipo test o Sí o no (o cargas un banco de escalera guardado) y las ordenas arrastrando; escalón 1 arriba. 15 escalones (seguros en 5, 10 y 15; se cambian en Ajustes), plantarse (X), pantalla final. **Comodines** configurables en Ajustes (hasta 5): nombre, icono (de un set propio o una imagen tuya) y si son 50:50 automático o solo se marcan como usados; se usan con las teclas 1-5. Si te enciendes en "Quién sale" (y la cámara Público), salen junto al concursante.
- **Estimación**: escribes la cifra de cada uno, revelado con recta animada, precio justo opcional y puntos al más cercano o escalonados.
- **Rosco**: 1 o 2 concursantes, cada uno con su rosco (se elige uno por cada uno; si falta, un aviso te lleva a la Biblioteca) y su reloj. A acierto, F fallo, Espacio pasapalabra, P pausa el reloj, **Tab cambia de concursante** sin marcar pasapalabra. Cuando a uno se le acaba el tiempo, se para y sale "Tiempo agotado" en el plató y en el panel; no pasa al otro hasta que pulsas **Pasar turno** (Espacio). La cámara del círculo es la del concursante que juega, y puedes salir tú al lado del reloj.
- Todas las pantallas de juego tienen **Poner en el aire** si ese juego no está en el aire.

### Biblioteca

Cada tipo de juego tiene sus bancos en su carpeta: `Documentos\KONKURSOX\preguntas\<tipo>\` (`test`, `sino`, `escalera`, `estimacion`, `quien`, `rosco`). El editor del panel permite crear, editar, duplicar, eliminar, marcar sin usar y poner imagen; el del rosco es una cuadrícula de 27 letras con **Importar desde texto** (`A: definición = RESPUESTA`, `Ñ (contiene): ... = ...`). Todo se guarda solo. En la escalera el editor enseña el escalón de cada pregunta, se reordena arrastrando y **Traer de Tipo test** copia preguntas de tus bancos de test; la primera vez se crea una "Escalera de ejemplo" con tus preguntas de test. Un banco eliminado va a `preguntas\_papelera\`.

Los bancos de versiones anteriores (mezclados en `preguntas\`) se reparten por tipo al arrancar y los originales se guardan en `preguntas\_antiguos\`. Un rosco con varias definiciones por letra se parte en varios roscos.

### Audio (siempre a la derecha)

Reproductor de la carpeta `Documentos\KONKURSOX\audio\musica\` (play/pausa, anterior/siguiente, barra para saltar, volumen, bucle y fundido). Arrastra canciones a la lista para añadirlas. Botonera de 9 efectos: clic derecho en un botón para elegir su sonido. Interruptor de **sonidos automáticos** del juego (cuáles suenan en cada momento, en Ajustes).

### Atajos

| Dónde | Tecla | Qué hace |
| --- | --- | --- |
| Siempre | F1-F5, F9 | Escenas (F9 muestra/oculta Multimedia) |
| Siempre | F6 / F7 / F8 | Cámaras: solo yo / solo el del turno / todos (si no estás en Juego, pone la escena Cámaras) |
| Siempre | Ctrl+1..9 | Efectos |
| Siempre | Ctrl+Espacio / Ctrl+F | Música: play-pausa / fundido |
| Siempre | Ctrl+Z | Deshacer el último paso del juego |
| Pantalla de juego | Espacio | Siguiente paso |
| Test, Sí o no, Escalera, ¿Quién lo dijo? | A-D, O, R, I | Marcar, ocultar/mostrar opciones, rebote, imagen |
| Juegos de preguntas y Estimación | T, Y | Temporizador: mostrar/ocultar, arrancar/pausar |
| Escalera | 1-5, X | Comodines, plantarse |
| Siempre | Ctrl+F1 / F2 / F3 | Plano de la escena Juego: juego / cámaras + datos / cámaras limpias |
| Estimación | C, T | Mostrar cifras en el plató, temporizador |
| Multimedia | Espacio | Play / pausa del vídeo |
| Rosco | A, F, Espacio, P, Tab | Acierto, fallo, pasapalabra, reloj, cambiar turno |

Ningún atajo se dispara mientras escribes en un campo de texto, salvo las teclas F (escenas y cámaras), que funcionan siempre.

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
