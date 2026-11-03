# ESTADO DEL PROYECTO — TEORIQ 0.1.0 (sesión 2, 2026-11-01: auditoría y cierre del MVP)

> **Primer uso real en AEOLCLOUD (2026-11-01):** la captura funciona (acierto/fallo, panel, plan, Falladas recientemente). Se encontró y corrigió un fallo: si se pasaba a la siguiente pregunta antes de los 500 ms de espera, el intento se perdía (25 contestadas, 21 registradas). Ver «Cambios» punto 6.
> **Imágenes (2026-11-01):** el usuario aportó el HTML real: `<img ng-if="currentTest.foto64" class="imagewrapper" src="data:image/png;base64, ...">` (foto JPEG incrustada, sin URL). Implementado: lectura, reducción a JPEG ≈380 px en el content script, guardado en `Question.imageData`, vistas en Repaso/Capturas, backup/import. Ver «Cambios» punto 7.

## Resultados de la auditoría (verificados en esta sesión)
| Comprobación | Resultado |
|---|---|
| `npm install` | OK |
| `npx tsc --noEmit` | Sin errores |
| `npm test` | **53/53 pasan** (41 originales + 3 «siguiente rápido» + 9 de imágenes) |
| `npm run build` | OK (`dist/`: background, content, sidepanel, options) |
| `npm run e2e` (Chromium + extensión real + página simulada, sin red) | **24/24 comprobaciones OK** |

## Cambios de esta sesión
1. `src/background.ts`: `setPanelBehavior({ openPanelOnActionClick: true })` se registra en cada arranque del service worker (antes solo en `onInstalled`/`onStartup`; el e2e lo detectó como `false` por carrera).
2. `tests/e2e.mjs`: selectores de pestañas con `getByRole('tab', { name: /^Capturas/ })`; el selector exacto fallaba porque la pestaña muestra el contador de pendientes.
3. `scripts/zip.mjs` creado (`npm run zip` apuntaba a un archivo inexistente).
4. Eliminado `dist-sim/` (carpeta residual vacía).
5. `PRIVACIDAD.md`, `PUBLICACION.md` y `README.md` ampliados/actualizados.
6. `src/capture/engine.ts`: si la pregunta desaparece (el usuario pulsa «Siguiente») antes de acabar la espera de estabilidad, se guarda lo último leído con la corrección visible (`flushOnLeave`), en vez de descartarlo. Una lectura dudosa sigue guardándose como «pendiente de revisión». +3 tests (44 en total).
7. **Imágenes de preguntas:** `selectors.ts` (`img.imagewrapper`), `adapters/aeolcloud/index.ts` (`readImage`: única imagen visible con data URI; 0 o varias distintas → null), `capture/engine.ts` (adjunta la imagen solo si no cambió entre la pregunta sin corregir y la corrección), `content.ts` (`shrink` con canvas → JPEG 380 px q0.6), `storage/repo.ts` (primera imagen válida gana; presupuesto 6,5 M caracteres; solo `data:image/jpeg;base64,`), `storage/backup.ts` (sanea/fusiona), `sidepanel/views.tsx` (`QuestionImage`; aviso si el enunciado habla de una imagen y aún no hay), CSS. +9 tests unitarios y +2 comprobaciones e2e (página simulada con imagen 800×600).
8. `tests/e2e.mjs`: reintento al consultar `chrome.sidePanel` (la primera ejecución falló una vez por carrera del test).

## Lo que cubre ahora el e2e (simulado, NO AEOLCLOUD real)
Carga y permisos · panel lateral registrado para abrirse con el icono · acierto · fallo · sin duplicados · corrección por partes · caso ambiguo → pendiente · Angular solo por clases · reintento = segundo intento · sin errores JS · otros sitios no se capturan · panel Hoy y Estadísticas con cifras correctas · resolver pendiente a mano · repaso · plan (ajustes) · exportar · persistencia tras cerrar/abrir el navegador · borrar → importar → no duplica · archivo inválido rechazado · página de opciones.

## Limitaciones de la verificación
- Si el usuario cambia de pregunta en menos de ~100 ms tras aparecer la corrección (antes de que el observador la lea), esa respuesta no se puede recuperar. No es realista a velocidad humana, pero no está probado en AEOLCLOUD real.
- Riesgo asumido en `flushOnLeave`: se confía en la última lectura aunque no haya cumplido los 500 ms. Si AEOLCLOUD pintara primero solo ✔ y luego ✘ en un fallo, una salida inmediata podría registrarse como acierto; no se ha observado.
- El «icono abre el panel» se verifica por el comportamiento registrado en Chrome (`getPanelBehavior`), no pulsando el icono físicamente (Playwright no puede hacerlo).
- El e2e del plan solo comprueba que la configuración se guarda; el contenido de las recomendaciones lo cubren los tests unitarios (`tests/review-plan.test.ts`), no se revisó a mano en esta sesión.
- **No se ha profundizado** en una revisión manual del código de captura ni de la clasificación por palabras clave más allá de los tests existentes.

## Resultados en AEOLCLOUD real (apartado independiente)
- **Imágenes: NO verificado en real.** Se ha probado con una `img.imagewrapper` simulada con el mismo formato que el HTML aportado. Falta comprobar: que la imagen se detecta donde la pinta AEOLCLOUD (se busca en todo el documento), que no hay más de una imagen distinta visible a la vez, y la calidad a 380 px.
- **PENDIENTE / NO VERIFICADO.** No hay acceso a la cuenta real. Supuesto sin verificar: los iconos `.fa-check`/`.fa-times` están dentro de cada `.answer`.
- Pendiente de inspeccionar: `preguntaCodigo` y tema de la plataforma. No se han inventado selectores.

## Pendiente
1. Prueba real en AEOLCLOUD (hacer un test y revisar *Capturas*); ajustar `src/adapters/aeolcloud/selectors.ts` solo con evidencia.
2. Revisar manualmente la clasificación por palabras clave (riesgo de coincidencias débiles) y la calidad del plan de estudio con datos reales.
3. Requisitos de Chrome Web Store (checklist en PUBLICACION.md).
4. Futuro: IA opcional con clave propia, mnemotecnias, simulacros, comparación semanal/mensual.

## Errores conocidos
- Si la corrección se completa >500 ms después de empezar a pintarse, se guarda como «pendiente de revisión» (se resuelve en *Capturas*).
- Tiempo de respuesta `null` en la primera pregunta tras recargar y si la pestaña estuvo oculta.
- Preguntas con mismo texto y opciones pero distinta imagen comparten identidad (se conserva la primera imagen). Las preguntas contestadas antes de la v. con imágenes no tienen imagen hasta volver a contestarlas.
- Presupuesto de imágenes ≈6,5 MB en `chrome.storage.local` (≈10 MB de cuota); sin `unlimitedStorage` a propósito.

## Siguiente paso exacto
`npm install && npm run check` y después probar en AEOLCLOUD real.
