# KONKURSOX REMAKE

Remake desde cero del concurso de TV casero. App de escritorio (Electron + Vite + TypeScript, renderer en TS/HTML/CSS sin frameworks) con dos ventanas:

- **Plató**: lienzo 1920x1080 escalado, sin marco, a pantalla completa en el monitor que elijas. Es lo que se comparte por Discord. Estética de `design/KONKURSOX 2.html` (marino y oro).
- **Panel del presentador**: ventana normal en el otro monitor. Estilo gris oscuro neutro propio, calcado de `design/panel.html`.

El estado vive **solo en el proceso main** (`src/main/store.ts`): los renderers mandan acciones por IPC y reciben el estado completo. Se guarda en `%APPDATA%\KONKURSOX\konkursox-state.json`: si cierras a media partida, al abrir sigues donde estabas.

## Cómo se usa

### Escenas (lo que sale en el plató)

Arriba del panel, la barra **En el aire**: Cabecera (F1), Cámaras (F2), Juego (F3), Marcador (F4), Clasificación final (F5) y Multimedia (F9). El plató pinta **solo** la escena en el aire. Cambiar de escena **no borra ni reinicia nada**: puedes ir a Cabecera a mitad de pregunta y volver con F3 tal cual estaba. Navegar por el panel tampoco cambia el plató.

La escena **Juego** enseña el juego que tiene el indicador **AIRE** en la navegación. Se elige con el desplegable del botón Juego, con el botón **Poner en el aire** de cada pantalla de juego, o al dar su primer paso visible (por ejemplo "Mostrar pregunta" o "Empezar el rosco"). Cada juego guarda su propia pregunta en curso: trabajar en uno no toca los demás.

**Plano** (un solo concepto, en la fila de realización y con Ctrl+F1..F5 siempre igual): **Juego** (solo si hay un juego en el aire), **Cámaras con marcos**, **Cámaras + datos** (cada cámara con un rótulo pegado abajo con sus datos del juego activo: rosco, escalera o puntos), **Cámaras limpias** y **Sin cámaras** (modo salón: el juego sin marcos de cámara, con la pregunta y las opciones más grandes y una fila de placas con los puntos y el turno resaltado; en el rosco, los dos roscos grandes con sus datos; en la escalera, la escalera de premios y la placa del concursante). En **Ajustes → Plató → Plano por defecto** eliges si el programa arranca en Juego o en Sin cámaras. Los planos de cámaras usan recuadros con la proporción de la cámara (16:9): 1 grande, 2 lado a lado, 3-4 en rejilla, 5 = 3 arriba y 2 abajo. F2 pone el último plano de cámaras usado; el botón Cámaras de la barra abre la pantalla Cámaras.

**Fila de realización** (debajo de las escenas, siempre a la vista): un interruptor por persona (tú, cada concursante y Público si está calibrada); en tu interruptor, ▾ elige cómo sales: igual, destacado o en una esquina. Después, el Plano, el Rótulo inferior y los preajustes Solo yo F6 / Turno F7 / Todos F8.

**Pantalla Cámaras** (pestañas): **Quién sale** (vista previa, plano, distribución con las plantillas del diseño, nombres, puntos y transición), **Asignación** (qué recuadro de Discord es de quién) y **Calibración** (ventana de Discord y recuadros).

**Columna derecha**: el marcador (nombres completos) y las pestañas Sonidos (botonera y sonidos automáticos), Efectos (Alt+1..9) y Música (reproductor; la lista se gestiona en Multimedia → Música de fondo).

**Ajustes** en pestañas: Plató y temas · Sonidos · Juegos · Personas del grupo · Programa.

**Multimedia (F9)**: en la sección Multimedia organizas imágenes y vídeos en carpetas (`Documentos\KONKURSOX\multimedia\`): arrástralos desde el ordenador o pega un enlace de YouTube (coge miniatura y título). Clic en uno lo saca a pantalla completa en el plató; los vídeos se controlan desde el panel (play/pausa con Espacio, barra, volumen) y el sonido sale por el plató. Si un vídeo de YouTube no permite incrustarse, el panel avisa. F9 muestra/oculta al instante y al ocultar vuelve a la escena anterior. La imagen de una pregunta se manda aquí con **Imagen a Multimedia**.

### Juegos

Tipo test, Sí o no, Escalera, Estimación, ¿Quién lo dijo? y Rosco. Cada pantalla tiene un **botón grande con el siguiente paso** (Espacio) y lo que viene después, controles secundarios debajo y **Deshacer** (Ctrl+Z), que deshace el último paso de ese juego.

- **Test / Sí o no / ¿Quién lo dijo?**: a quién va se elige en un solo control (un botón por concursante + "Todos") con el interruptor "Rebote" al lado; si falla y el rebote está activo, el botón principal ofrece "Rebote a X" sin desvelar la correcta. Flujo: las opciones se muestran **de una en una** con Espacio (el botón dice "Mostrar opción B"...; al lado, "Mostrar todas"), **Marcar** (A-D o clic en la opción: queda en naranja en el plató como respuesta definitiva, se puede cambiar o desmarcar con Retroceso), Revelar y Siguiente. En "todos responden" cada marca se asigna al concursante seleccionado y salta al siguiente. Con un solo concursante no se puede elegir turno, todos responden ni rebote. Una pregunta cuenta como **usada al revelarla** (no al cargarla); en la lista, ↺ o clic derecho la desmarca y "Reiniciar usadas" desmarca todo el banco. Se guarda en el propio banco.
- **Temporizador** (en todos los juegos de preguntas y en Estimación): independiente, nunca arranca solo. T lo muestra u oculta en el plató (aunque esté corriendo), Y arranca o pausa, y "Reiniciar". En Ajustes solo se elige la duración.
- **Escalera**: con **Preparar preguntas** eliges preguntas de cualquier banco de Tipo test o Sí o no (o cargas un banco de escalera guardado) y las ordenas arrastrando; escalón 1 arriba. 15 escalones (seguros en 5, 10 y 15; se cambian en Ajustes), plantarse (X), pantalla final. **Comodines** configurables en Ajustes (hasta 5): nombre, icono (de un set propio o una imagen tuya) y si son 50:50 automático o solo se marcan como usados; se usan con las teclas 1-5. Si te enciendes en "Quién sale" (y la cámara Público), salen junto al concursante.
- **Estimación**: escribes la cifra de cada uno, revelado con recta animada, precio justo opcional y puntos al más cercano o escalonados.
- **Rosco**: 1 o 2 concursantes, cada uno con su rosco (se elige uno por cada uno; si falta, un aviso te lleva a la Biblioteca) y su reloj. A acierto, F fallo, Espacio pasapalabra, P pausa el reloj, **Tab cambia de concursante** sin marcar pasapalabra. Cuando a uno se le acaba el tiempo, se para y sale "Tiempo agotado" en el plató y en el panel; no pasa al otro hasta que pulsas **Pasar turno** (Espacio). La cámara del círculo es la del concursante que juega, y puedes salir tú al lado del reloj.
- **Perdonar un fallo**: cuando alguien falla sale una barra con **Segunda oportunidad** (G: la opción fallada queda tachada y vuelve a elegir; en la escalera no cae) y **Seguir igualmente** (H: como si hubiera acertado; en la escalera sube, en los demás un interruptor decide si suma los puntos). En "todos responden", "Dar por buena" a cada uno. Interruptor **Soborno** (apagado por defecto): al perdonar sale en el plató el rótulo "SOBORNO ACEPTADO" con su sonido (se elige en Ajustes, Sonidos automáticos). En el rosco, el último fallo se convierte en acierto (G) o pasapalabra (H) desde su barra, o haciendo clic en cualquier letra roja; los puntos se recalculan solos.
- **Corregir la respuesta en directo**: clic derecho en una opción (o "Hacer correcta" al pasar el ratón) la convierte en la correcta, antes o después de revelar; en Estimación, "Cambiar cifra". Si ya estaba revelada, el plató y los puntos (y la escalera) se recalculan. Después pregunta si guardarlo en el banco o solo para esta partida.
- Todas las pantallas de juego tienen **Poner en el aire** si ese juego no está en el aire.

### Biblioteca

Cada tipo de juego tiene sus bancos en su carpeta: `Documentos\KONKURSOX\preguntas\<tipo>\` (`test`, `sino`, `escalera`, `estimacion`, `quien`, `rosco`). El editor del panel permite crear, editar, duplicar, eliminar, marcar sin usar y poner imagen; el del rosco es una cuadrícula de 27 letras con **Importar desde texto** (`A: definición = RESPUESTA`, `Ñ (contiene): ... = ...`). Todo se guarda solo. En la escalera el editor enseña el escalón de cada pregunta, se reordena arrastrando y **Traer de Tipo test** copia preguntas de tus bancos de test; la primera vez se crea una "Escalera de ejemplo" con tus preguntas de test. Un banco eliminado va a `preguntas\_papelera\`.

Los bancos de versiones anteriores (mezclados en `preguntas\`) se reparten por tipo al arrancar y los originales se guardan en `preguntas\_antiguos\`. Un rosco con varias definiciones por letra se parte en varios roscos.

### Audio (siempre a la derecha)

Reproductor de la carpeta `Documentos\KONKURSOX\audio\musica\` (play/pausa, anterior/siguiente, barra para saltar, volumen, bucle y fundido). Arrastra canciones a la lista o añádelas desde **Multimedia → Música de fondo** (es la misma biblioteca).

**Botonera de sonidos** (3×3, con la misma disposición que el teclado numérico: 7 8 9 / 4 5 6 / 1 2 3): Num1-Num9 con Bloq Num activado, o Ctrl+1..9. Clic derecho en un botón para elegir su sonido.

**Efectos visuales del plató** (Alt+1..9), debajo de los sonidos: Tensión (viñeta), Apagón (todo oscuro salvo la pregunta), Focos, Latido (desenfoque que palpita, con su sonido en bucle), Foco en uno (elige a quién) se quedan hasta volver a pulsarlos; Temblor, Destello y Confeti son golpes. Nunca tapan la pregunta, las opciones ni el reloj. "Quitar todos" los apaga.

**Ajustes → Sonidos**: la botonera, los sonidos automáticos del juego y los de los efectos visuales, cada uno con ▶ para escucharlo, su archivo (o "Importar un archivo…") y su volumen propio.

La app trae su propio juego de sonidos (`kx-*.wav`, generados con ElevenLabs, estilo concurso de televisión orquestal) y otras versiones en `audio\efectos\alternativas\` para cambiarlas desde Ajustes. Tus sonidos anteriores siguen en la carpeta.

### Temas del plató

En **Ajustes → Plató** eliges el tema: Clásico (marino y oro), Noche, Claro y acentos rojo, verde y morado. Solo cambia el plató (y sus vistas previas), no el panel. Cada tema es un archivo `.json` en `Documentos\KONKURSOX\temas\` con variables CSS (colores, tipografías y brillo de los marcos): copia uno, cámbialo y aparecerá en la lista ("Recargar").

### Atajos

| Dónde | Tecla | Qué hace |
| --- | --- | --- |
| Siempre | F1-F5, F9 | Escenas (F9 muestra/oculta Multimedia) |
| Siempre | F6 / F7 / F8 | Cámaras: solo yo / solo el del turno / todos (si no estás en Juego, pone la escena Cámaras) |
| Siempre | Num1-Num9 (Bloq Num) o Ctrl+1..9 | Botonera de sonidos |
| Siempre | Alt+1..9 | Efectos visuales del plató |
| Siempre | Ctrl+Espacio / Ctrl+F | Música: play-pausa / fundido |
| Siempre | Ctrl+Z | Deshacer el último paso del juego |
| Pantalla de juego | Espacio | Siguiente paso |
| Test, Sí o no, Escalera, ¿Quién lo dijo? | A-D, O, R, I | Marcar, ocultar/mostrar opciones, rebote, imagen |
| Juegos de preguntas y Estimación | T, Y | Temporizador: mostrar/ocultar, arrancar/pausar |
| Escalera | 1-5, X | Comodines, plantarse |
| Siempre | Ctrl+F1 / F2 / F3 / F4 / F5 | Plano: Juego / Cámaras con marcos / Cámaras + datos / Cámaras limpias / Sin cámaras |
| Estimación | C, T | Mostrar cifras en el plató, temporizador |
| Multimedia | Espacio | Play / pausa del vídeo |
| Rosco | A, F, Espacio, P, Tab | Acierto, fallo, pasapalabra, reloj, cambiar turno |

Ningún atajo se dispara mientras escribes en un campo de texto, salvo las teclas F (escenas y cámaras), que funcionan siempre.

### El móvil como mando (modo salón)

El móvil hace de mando con los mismos botones del panel: escenas, plano y quién sale, el botón grande del siguiente paso, marcar respuestas (también "todos responden"), segunda oportunidad / seguir igualmente / soborno, cambiar la correcta (pulsación larga en una opción), comodines y plantarse, la cifra de cada uno en Estimación (teclado), el rosco (acierto, fallo, pasapalabra, reloj, cambiar turno y corregir un fallo), elegir la pregunta del banco, sonidos, efectos, música y el marcador con deshacer. Ve la respuesta correcta (solo él). La preparación (biblioteca, editar, calibrar, ajustes) se queda en el portátil.

- **Una vez**: en **Ajustes → Programa → Mando (móvil)** pega la clave de Ably. Se guarda solo en este ordenador (`%APPDATA%\KONKURSOX\mando.json`), nunca en el repo ni en el instalador.
- **Emparejar**: botón **Mando** de la barra superior (o Ajustes → Programa) → escanea el QR con la cámara del móvil. El enlace lleva un permiso temporal solo para el canal de esa partida (no la clave); el programa lo renueva mientras está abierto. "Copiar enlace" para mandarlo por otro lado; "QR en la cabecera del plató" lo enseña en la Cabecera.
- **Instalar**: en el móvil, menú del navegador → "Añadir a pantalla de inicio" (KONKURSOX Mando). Recuerda el emparejamiento: al abrirla con el programa abierto se reconecta sola. Mantiene la pantalla encendida y vibra en las acciones importantes.
- **Desconectar mando** cambia el canal: el móvil queda fuera y hay que volver a escanear.
- **Mantener pulsado 1 segundo** (la barra se rellena en el botón) para lo que no se deshace fácil: plantarse, terminar la escalera, desconectar el mando (tocando el estado de la conexión, arriba) y cambiar de juego en el aire con una pregunta a medias.
- Los relojes (rosco, temporizador, música) no se envían en cada tic: el programa manda inicio, pausa y tiempo restante, y el móvil cuenta en local. Los cambios muy seguidos se juntan (como mucho unos 3 envíos por segundo). En una partida normal son unos 15 mensajes por minuto, uno por paso.
- El programa es la única fuente de verdad: el móvil manda órdenes y recibe el estado. Si chocan una orden del móvil y algo que acabas de hacer en el panel, manda el panel.
- La app del mando está en `mando/` y se publica sola en GitHub Pages (https://mestrangis.github.io/konkursox-2/) con cada cambio en `main`.

### Llevar el concurso a otro ordenador

En **Ajustes → Programa**:

- **Exportar todo**: un único archivo `.konkursox` (un zip) con toda la carpeta `Documentos\KONKURSOX` (preguntas, imágenes, audio, multimedia, temas; también la música si la tienes en otra carpeta) y toda la configuración del programa (ajustes, concursantes, personas, sonidos asignados, comodines, temas, plano por defecto), **incluida la clave del mando**. Siempre lo exporta todo. Guárdalo en sitio seguro.
- **Importar…**: abre un `.konkursox`, enseña de cuándo es y cuánto ocupa, avisa de que sustituye lo de este ordenador y lo restaura todo (también la clave). Primero lo descomprime aparte, así que si el archivo está mal no se toca nada. Después el programa se reinicia.
- Al abrir el programa por primera vez en un ordenador sin datos, ofrece directamente **Importar desde un archivo**.
- **Borrar mis datos de este ordenador** (hay que escribir BORRAR): elimina `Documentos\KONKURSOX`, toda la configuración y la clave del mando, y desconecta el móvil. El programa se reinicia como recién instalado.

La configuración vive en `%APPDATA%\KONKURSOX` (`konkursox-state.json` y `mando.json` con la clave del mando, guardada de forma atómica y con copia `.bak`). Esa carpeta no cambia entre versiones y el instalador no la borra al actualizar.

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
