# TEORIQ 0.1.0

Extensión de Chrome (Manifest V3) que registra automáticamente tus respuestas en los tests del permiso B de **AEOLCLOUD**
(`https://cloud.aeolservice.es/`), analiza tus fallos y te propone qué repasar hoy. Todo se guarda en tu navegador.

## Instalar
1. Requisitos: Node 20+ y Chrome 114+.
2. `npm install` y `npm run build` (genera la carpeta `dist/`).
3. En Chrome: `chrome://extensions` → activar «Modo desarrollador» → «Cargar descomprimida» → elegir `dist/`.
4. Entra en AEOLCLOUD y haz un test. Pulsa el icono de TEORIQ para abrir el panel lateral.

## Cómo funciona
- El *content script* observa la página (`MutationObserver`), espera a que la corrección se estabilice (500 ms) y envía **una** captura por intento.
- Acierto = solo `.fa-check` visible. Fallo = un `.fa-times` (la elegida) y un `.fa-check` (la correcta) visibles, en opciones distintas.
- Se comprueba la visibilidad real (`ng-hide`, `display`, `visibility`, `opacity`, ancestros). Cualquier combinación dudosa → **«pendiente de revisión»**, que no cuenta en las estadísticas hasta que la confirmes en la pestaña *Capturas*.
- Una pregunta que ya aparece corregida al cargar (no la viste contestar) no se registra.
- El service worker es el único que escribe datos (cola serializada, sin duplicados).

## Panel
Hoy · Estadísticas · Repaso (Leitner) · Plan (fecha de examen, minutos y nº de preguntas al día) · Capturas (revisión, tema manual, borrar) · Datos (exportar/importar JSON, borrar).

## Estructura
`src/adapters/aeolcloud/` (único código específico de la plataforma) · `src/capture/` · `src/storage/` · `src/analytics/` · `src/review/` · `src/study-plan/` · `src/sidepanel/` · `src/options/` · `tests/` · `test-page/`

## Comandos
`npm run build` · `npm run typecheck` · `npm test` (41 pruebas unitarias) · `npm run e2e` (Chromium + extensión real, sin red; 22 comprobaciones) · `npm run zip` (genera TEORIQ.zip) · `npm run build:dev` + `npm run serve:test` (probar con la página simulada en localhost)

## Limitaciones conocidas
- **Imágenes de las preguntas** (`img.imagewrapper`, foto incrustada en el HTML de AEOLCLOUD): se guardan reducidas (≈380 px, JPEG) la primera vez que contestas la pregunta y se ven en *Repaso* y *Capturas*. Las preguntas que contestaste antes de esta versión no tienen imagen hasta que las vuelvas a contestar en AEOLCLOUD. Presupuesto de ≈6,5 MB para imágenes (unas 500–700 preguntas con imagen); al llegar al límite se siguen guardando intentos pero no imágenes nuevas. Si hay varias imágenes distintas visibles o la imagen cambió justo al responder, no se adjunta ninguna. Dos preguntas con el mismo texto y opciones pero distinta imagen comparten identidad (se conserva la primera imagen).
- Id interno de pregunta (`preguntaCodigo`) y categoría de la plataforma: no leídos todavía; el tema se clasifica con palabras clave locales (no oficial, corregible a mano).
- Cuota de `chrome.storage.local` ≈ 10 MB (miles de intentos). Exporta copias periódicamente.
- Si cargas la extensión desde otra carpeta, el id se mantiene (el manifest lleva `key`), por lo que no pierdes datos.
