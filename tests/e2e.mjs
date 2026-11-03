// Prueba end-to-end con la extensión REAL cargada en Chromium (build de producción en dist/).
// - Sirve la página simulada de test-page/ como si fuera https://cloud.aeolservice.es (interceptando la red).
// - NO usa tu cuenta de AEOLCLOUD ni accede a internet.
// Uso: npm run build && npm run e2e      (SHOTS_DIR=.shots para guardar capturas de pantalla)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

// Playwright local; si su Chromium no está instalado, el global.
function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const tries = [() => req('playwright')];
  try { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); tries.push(() => createRequire(join(g, 'x.js'))('playwright')); } catch { /* sin global */ }
  for (const t of tries) { try { const pw = t(); if (existsSync(pw.chromium.executablePath())) return pw; } catch { /* siguiente */ } }
  throw new Error('No se encontró Playwright con Chromium. Ejecuta: npx playwright install chromium');
}
const { chromium } = loadPlaywright();

const dist = resolve('dist');
assert.ok(existsSync(join(dist, 'manifest.json')), 'Falta dist/. Ejecuta antes: npm run build');
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const SIM = readFileSync(resolve('test-page/aeolcloud-sim.html'), 'utf8');
const shots = process.env.SHOTS_DIR; if (shots) mkdirSync(shots, { recursive: true });
const userData = mkdtempSync(join(tmpdir(), 'teoriq-e2e-'));
const outDir = mkdtempSync(join(tmpdir(), 'teoriq-e2e-out-'));
const AEOL = 'https://cloud.aeolservice.es/estudio_offline/134/24';

let passed = 0;
const ok = (name) => { passed++; console.log(`  ✓ ${name}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const ctx = await chromium.launchPersistentContext(userData, {
    headless: false, viewport: { width: 460, height: 900 },
    args: ['--headless=new', `--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--no-sandbox'],
  });
  await ctx.route('https://cloud.aeolservice.es/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: SIM }));
  await ctx.route('https://example.org/**', (r) => r.fulfill({ contentType: 'text/html', body: SIM }));
  let [sw] = ctx.serviceWorkers(); sw ??= await ctx.waitForEvent('serviceworker');
  return { ctx, sw, id: new URL(sw.url()).host };
}
const shot = async (page, n) => { if (shots) await page.screenshot({ path: join(shots, `${n}.png`) }); };
const dump = (page) => page.evaluate(() => chrome.storage.local.get(null));
const attemptsOf = (d) => Object.entries(d).filter(([k]) => k.startsWith('att:')).map(([, v]) => v).sort((a, b) => a.ts - b.ts);

/** Contesta la pregunta visible (índice de opción) y espera a que el simulador pinte la corrección. */
async function answer(page, k) {
  await page.locator('.answer').nth(k).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.answer .fa:not(.ng-hide)')].length > 0, null, { timeout: 5000 });
}
const next = (page) => page.click('#next');

try {
  console.log('TEORIQ e2e (extensión real en Chromium)');
  // ───────── 1. Carga ─────────
  let { ctx, sw, id } = await launch();
  const errors = [];
  assert.ok(id, 'la extensión se carga y arranca su service worker');
  ok(`extensión cargada (id ${id})`);
  assert.deepEqual([...manifest.permissions].sort(), ['sidePanel', 'storage']);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://cloud.aeolservice.es/*']);
  ok('permisos mínimos: storage + sidePanel; content script solo en cloud.aeolservice.es; sin host_permissions');
  // El service worker puede tardar un instante en exponer chrome.sidePanel: se reintenta (la primera ejecución a veces lo pillaba antes).
  let behavior;
  for (let n = 0; n < 10 && !behavior; n++) {
    try { behavior = await sw.evaluate(() => chrome.sidePanel.getPanelBehavior()); } catch { await sleep(300); [sw] = ctx.serviceWorkers().length ? ctx.serviceWorkers() : [sw]; }
  }
  assert.equal(behavior.openPanelOnActionClick, true);
  ok('el icono de la extensión abre el panel lateral (comportamiento registrado en Chrome)');

  // ───────── 2. Captura automática ─────────
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(AEOL);
  await page.waitForSelector('.question .answer');
  await sleep(400);
  await answer(page, 0);                      // P1: correcta (índice 0)
  await sleep(1500);
  await shot(page, '1-captura');
  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  const read = async () => attemptsOf(await dump(panel));
  let att = await read();
  assert.equal(att.length, 1);
  assert.equal(att[0].result, 'correct'); assert.equal(att[0].confidence, 'confirmed');
  ok('acierto detectado y guardado automáticamente (confirmado)');

  // Imagen de la pregunta 1 (img.imagewrapper en data URI): guardada reducida a JPEG
  const q1 = Object.values(await dump(panel)).find((v) => v && v.key && v.stem && v.stem.startsWith('¿Qué indica la señal triangular'));
  assert.ok(q1?.imageData?.startsWith('data:image/jpeg;base64,'), 'la imagen se guarda como JPEG reducido');
  const dims = await panel.evaluate((src) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = src; }), q1.imageData);
  assert.deepEqual(dims, [380, 285]);
  ok('la imagen de la pregunta (800x600) se guarda reducida (380x285, JPEG) y solo en la pregunta que la tiene');
  const others = Object.values(await dump(panel)).filter((v) => v && v.key && v.stem && !v.stem.startsWith('¿Qué indica la señal triangular'));
  assert.ok(others.every((o) => !o.imageData));

  await next(page); await sleep(300); await answer(page, 0); await sleep(1500);    // P2: elige A, correcta B → fallo
  att = await read();
  assert.equal(att.length, 2);
  assert.equal(att[1].result, 'wrong');
  assert.equal(att[1].selectedText, 'El sistema ABS'); assert.equal(att[1].correctText, 'El cinturón de seguridad');
  assert.equal(att[1].confidence, 'confirmed');
  ok('fallo detectado: respuesta elegida (.fa-times) y correcta (.fa-check) distintas');

  await sleep(2500); // re-renders / tiempo extra: no debe haber duplicados
  assert.equal((await read()).length, 2);
  ok('sin duplicados tras re-renderizados');

  // Corrección lenta (✘ primero, ✔ 250 ms después): debe esperar y guardar completo
  await page.check('#slow');
  await next(page); await sleep(300); await answer(page, 0); await sleep(2000);   // P3: elige 100, correcta 120 → fallo
  att = await read();
  assert.equal(att.length, 3);
  assert.equal(att[2].confidence, 'confirmed'); assert.equal(att[2].correctText, '120 km/h');
  ok('corrección que llega por partes: espera y guarda un único intento completo');

  // Corrección rota: solo ✘ → pendiente de revisión, nunca confirmado
  await page.uncheck('#slow'); await page.check('#broken');
  await next(page); await sleep(300); await page.locator('.answer').nth(1).click(); await sleep(2200);  // P4: elige B (incorrecta), sin ✔
  att = await read();
  assert.equal(att.length, 4);
  assert.equal(att[3].confidence, 'review'); assert.equal(att[3].correctText, null);
  ok('indicadores incompletos → «pendiente de revisión» (no se inventa la correcta)');
  await page.uncheck('#broken');

  // Modo "actualizar in situ": solo cambian clases ng-hide
  await page.uncheck('#recreate');
  await next(page); await sleep(300); await answer(page, 0); await sleep(1500);   // P5 correcta (índice 0)
  att = await read();
  assert.equal(att.length, 5); assert.equal(att[4].result, 'correct');
  ok('también funciona cuando Angular solo cambia clases (sin recrear nodos)');
  await page.check('#recreate');

  // Segunda vuelta: la P1 se vuelve a responder (esta vez mal) → nuevo intento sobre la misma pregunta
  await next(page); await sleep(300);   // vuelve a P1
  await answer(page, 1); await sleep(1500);
  att = await read();
  assert.equal(att.length, 6);
  const p1 = att.filter((a) => a.questionKey === att[0].questionKey);
  assert.equal(p1.length, 2); assert.deepEqual(p1.map((a) => a.result), ['correct', 'wrong']);
  ok('la misma pregunta contestada otra vez genera un segundo intento (para detectar errores repetidos)');

  // Aviso en la página no rompe nada
  assert.deepEqual(errors, []); ok('sin errores de JavaScript en la página');

  // Un sitio no soportado no genera capturas ni puede inyectarlas
  const other = await ctx.newPage(); await other.goto('https://example.org/'); await other.waitForSelector('.question .answer');
  await other.locator('.answer').first().click(); await sleep(1200);
  assert.equal((await read()).length, 6);
  const rej = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'teoriq:capture', payload: { platform: 'aeolcloud', key: 'x', stem: 's', options: ['a', 'b'], selectedIndex: 0, correctIndex: 0, result: 'correct', confidence: 'confirmed', ts: Date.now(), responseMs: null } }));
  assert.equal(rej.ok, false); assert.equal((await read()).length, 6);
  ok('otros sitios no se capturan y el background rechaza capturas con origen no válido');
  await other.close();

  // ───────── 3. Panel ─────────
  await panel.reload(); await panel.waitForSelector('.hero');
  const txt = await panel.locator('main').innerText();
  assert.match(txt, /Cómo vas/i); assert.match(txt, /Dónde fallas/i); assert.match(txt, /Qué estudiar hoy/i);
  assert.match(await panel.locator('.kv').innerText(), /Contestadas\s*5/);   // 5 confirmadas (la 4ª está pendiente)
  assert.match(txt, /pendiente de revisión/); assert.match(txt, /pocos datos/i);
  await shot(panel, '2-panel-hoy');
  ok('panel «Hoy»: totales correctos (5 confirmadas; la pendiente aparte) y aviso de datos insuficientes');

  await panel.getByRole('tab', { name: /^Estadísticas/ }).click(); await panel.waitForSelector('text=Temas');
  assert.match(await panel.locator('main').innerText(), /Datos insuficientes/i);
  await shot(panel, '3-estadisticas'); ok('panel «Estadísticas»');

  await panel.getByRole('tab', { name: /^Capturas/ }).click();
  await panel.waitForSelector('.cap.pending');
  assert.equal(await panel.locator('.cap').count(), 6);
  // Resolver la captura pendiente a mano
  const pend = panel.locator('.cap.pending');
  await pend.locator('select').nth(1).selectOption({ index: 2 }); // correcta = 3ª opción
  await pend.getByRole('button', { name: 'Confirmar' }).click();
  await panel.waitForFunction(() => document.querySelectorAll('.cap.pending').length === 0);
  assert.equal(attemptsOf(await dump(panel)).filter((a) => a.confidence === 'review').length, 0);
  await shot(panel, '4-capturas'); ok('captura pendiente resuelta a mano desde el panel → pasa a confirmada');
  assert.ok((await panel.locator('.cap img.q-img').count()) >= 1, 'la imagen guardada se muestra en Capturas');
  assert.equal(await panel.locator('.cap img.q-img').first().evaluate((i) => i.naturalWidth > 0), true);
  ok('la imagen guardada se ve en el panel (pestaña Capturas)');

  // Repaso
  await panel.getByRole('tab', { name: /^Repaso/ }).click();
  await panel.getByRole('button', { name: /^Repasar/ }).click();
  await panel.waitForSelector('.question-stem');
  await panel.locator('.opt').first().click(); await panel.waitForSelector('.after');
  const before = attemptsOf(await dump(panel)).length;
  assert.ok(attemptsOf(await dump(panel)).some((a) => a.source === 'review'));
  await shot(panel, '5-repaso'); ok('modo de repaso: responde y registra el intento (source=review)');
  assert.ok(before >= 7);

  // Plan
  await panel.getByRole('tab', { name: /^Plan/ }).click();
  await panel.fill('input[type=date]', '2026-12-15');
  await panel.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings?.examDate === '2026-12-15');
  await shot(panel, '6-plan'); ok('plan de estudio: la configuración (fecha de examen) se guarda');

  // ───────── 4. Exportar / persistir / importar ─────────
  await panel.getByRole('tab', { name: /^Datos/ }).click();
  const [dl] = await Promise.all([panel.waitForEvent('download'), panel.getByRole('button', { name: 'Exportar a JSON' }).click()]);
  const backupPath = join(outDir, 'backup.json'); await dl.saveAs(backupPath);
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  const totalAttempts = attemptsOf(await dump(panel)).length;
  assert.equal(backup.app, 'teoriq'); assert.equal(backup.attempts.length, totalAttempts); assert.ok(backup.questions.length >= 4);
  assert.equal(backup.settings.examDate, '2026-12-15');
  ok(`exportación a JSON (${backup.attempts.length} intentos, ${backup.questions.length} preguntas)`);

  await ctx.close();   // cerrar el navegador
  ({ ctx, sw, id } = await launch());   // …y abrirlo de nuevo con el mismo perfil
  const panel2 = await ctx.newPage(); await panel2.goto(`chrome-extension://${id}/sidepanel.html`);
  await panel2.waitForSelector('.hero');
  assert.equal(attemptsOf(await dump(panel2)).length, totalAttempts);
  assert.match(await panel2.locator('.kv').innerText(), /Contestadas/);
  ok('los datos siguen ahí tras cerrar y volver a abrir el navegador (y el id de la extensión es estable)');

  // Borrar todo y restaurar la copia
  panel2.on('dialog', (d) => d.accept());
  await panel2.getByRole('tab', { name: /^Datos/ }).click();
  await panel2.getByRole('button', { name: 'Borrar todos mis datos' }).click();
  await panel2.waitForFunction(async () => Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('att:')).length === 0);
  await panel2.setInputFiles('#import-file', backupPath);
  await panel2.waitForFunction(async (n) => Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('att:')).length === n, totalAttempts);
  await panel2.waitForSelector('text=Importado');
  // Importar dos veces no duplica
  await panel2.setInputFiles('#import-file', backupPath); await sleep(800);
  assert.equal(attemptsOf(await dump(panel2)).length, totalAttempts);
  await shot(panel2, '7-datos');
  ok('borrar → importar la copia restaura todo; importar otra vez no duplica');

  // Archivo inválido
  const bad = join(outDir, 'malo.json'); writeFileSync(bad, '{"hola":1}');
  await panel2.setInputFiles('#import-file', bad);
  await panel2.waitForSelector('text=no es una copia de seguridad de TEORIQ');
  ok('un archivo inválido se rechaza con un mensaje claro');

  // Página de opciones
  const opt = await ctx.newPage(); await opt.goto(`chrome-extension://${id}/options.html`); await opt.waitForSelector('text=Copia de seguridad');
  ok('página de opciones abre');
  await ctx.close();
  console.log(`\n${passed} comprobaciones OK`);
} catch (e) {
  console.error('\n✗ FALLO E2E:', e);
  process.exitCode = 1;
} finally {
  rmSync(userData, { recursive: true, force: true });
}
