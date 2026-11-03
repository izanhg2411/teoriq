import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aeolcloud } from '../src/adapters/aeolcloud';
import { evaluate } from '../src/capture/evaluate';
import { CaptureEngine } from '../src/capture/engine';
import type { CapturePayload } from '../src/core/types';
import { makeDom, manualClock, questionHtml, type Opt } from './helpers';

const OPTS = (a: Partial<Opt>, b: Partial<Opt> = {}, c: Partial<Opt> = {}): Opt[] => [
  { text: 'Prohibido girar a la izquierda', ...a }, { text: 'Ceda el paso', ...b }, { text: 'Stop', ...c },
];
const STEM = '¿Qué indica la señal?';

function setup(html: string) {
  const dom = makeDom(html);
  const clock = manualClock();
  const got: CapturePayload[] = [];
  const engine = new CaptureEngine({
    doc: dom.window.document, adapter: aeolcloud, onCapture: (p) => got.push(p),
    now: clock.now, schedule: clock.schedule, settleMs: 500, debounceMs: 100,
  });
  const doc = dom.window.document;
  const q = () => doc.querySelector('.question')!;
  const replace = (h: string) => { q().outerHTML = h; };
  return { dom, doc, clock, got, engine, q, replace };
}

// ---------- Adaptador + evaluación sobre DOM real (jsdom) ----------
test('adaptador: lee enunciado, opciones e iconos visibles', () => {
  const { doc } = setup(questionHtml(STEM, OPTS({}, { check: 'show' })));
  const snap = aeolcloud.read(doc.querySelector('.question')!)!;
  assert.equal(snap.stem, STEM);
  assert.deepEqual(snap.options.map((o) => o.text), ['Prohibido girar a la izquierda', 'Ceda el paso', 'Stop']);
  assert.deepEqual(snap.options.map((o) => o.checkVisible), [false, true, false]);
});

test('detecta ACIERTO: solo la correcta con .fa-check', () => {
  const { doc } = setup(questionHtml(STEM, OPTS({ check: 'show' })));
  const ev = evaluate(aeolcloud.read(doc.querySelector('.question')!)!);
  assert.deepEqual(ev, { state: 'correct', selectedIndex: 0, correctIndex: 0 });
});

test('detecta ERROR: elegida con .fa-times y correcta con .fa-check (no se confunden)', () => {
  const { doc } = setup(questionHtml('Los sistemas de seguridad pasiva incluyen...', OPTS({}, { times: 'show' }, { check: 'show' })));
  const ev = evaluate(aeolcloud.read(doc.querySelector('.question')!)!);
  assert.deepEqual(ev, { state: 'wrong', selectedIndex: 1, correctIndex: 2 });
});

test('pregunta SIN indicadores: no hay corrección', () => {
  const { doc } = setup(questionHtml(STEM, OPTS({})));
  assert.equal(evaluate(aeolcloud.read(doc.querySelector('.question')!)!).state, 'no-correction');
});

test('indicadores OCULTOS (ng-hide en el icono, en un ancestro o display:none) no cuentan', () => {
  for (const st of ['hide', 'hide-parent', 'hide-style'] as const) {
    const { doc } = setup(questionHtml(STEM, OPTS({ check: st, times: st }, { check: st })));
    const snap = aeolcloud.read(doc.querySelector('.question')!)!;
    assert.ok(snap.options.every((o) => !o.checkVisible && !o.timesVisible), `estado ${st}`);
    assert.equal(evaluate(snap).state, 'no-correction');
  }
});

test('combinaciones dudosas se marcan para REVISIÓN, nunca como confirmadas', () => {
  const only = setup(questionHtml(STEM, OPTS({ times: 'show' })));
  const e1 = evaluate(aeolcloud.read(only.q())!);
  assert.equal(e1.state, 'review'); assert.equal(e1.selectedIndex, 0); assert.equal(e1.correctIndex, null);
  const two = setup(questionHtml(STEM, OPTS({ check: 'show' }, { check: 'show' })));
  assert.equal(evaluate(aeolcloud.read(two.q())!).state, 'review');
  const same = setup(questionHtml(STEM, OPTS({ check: 'show', times: 'show' })));
  assert.equal(evaluate(aeolcloud.read(same.q())!).state, 'review');
});

test('Angular sin compilar ({{ }}) o con menos de 2 opciones se ignora', () => {
  const raw = setup(questionHtml('{{currentTest.pregunta}}', OPTS({})));
  assert.equal(aeolcloud.read(raw.q()), null);
  const one = setup(questionHtml(STEM, [{ text: 'Solo una' }]));
  assert.equal(aeolcloud.read(one.q()), null);
});

// ---------- Motor: cambios dinámicos y duplicados ----------
test('motor: espera a la corrección, guarda UNA vez y mide el tiempo', () => {
  const t = setup(questionHtml('Pregunta previa', [{ text: 'A' }, { text: 'B' }]));
  t.engine.start();
  t.replace(questionHtml(STEM, OPTS({}))); // la pregunta aparece DESPUÉS de cargar la página (Angular)
  t.engine.scan();
  t.clock.advance(4000); // el usuario piensa 4 s
  t.replace(questionHtml(STEM, OPTS({}, { check: 'show' })));
  t.engine.scan();
  assert.equal(t.got.length, 0, 'aún no: debe esperar a que se estabilice');
  t.clock.advance(499);
  assert.equal(t.got.length, 0);
  t.clock.advance(2);
  assert.equal(t.got.length, 1);
  const p = t.got[0]!;
  assert.equal(p.result, 'correct'); assert.equal(p.confidence, 'confirmed');
  assert.equal(p.selectedIndex, 1); assert.equal(p.correctIndex, 1);
  assert.equal(p.responseMs, 4000);
  // Angular vuelve a renderizar lo mismo varias veces: no debe duplicar.
  for (let i = 0; i < 5; i++) { t.replace(questionHtml(STEM, OPTS({}, { check: 'show' }))); t.engine.scan(); t.clock.advance(1000); }
  assert.equal(t.got.length, 1);
});

test('motor: error confirmado con elegida y correcta distintas', () => {
  const t = setup(questionHtml(STEM, OPTS({})));
  t.engine.start();
  t.clock.advance(2000);
  t.replace(questionHtml(STEM, OPTS({}, { times: 'show' }, { check: 'show' })));
  t.engine.scan(); t.clock.advance(600);
  assert.equal(t.got.length, 1);
  assert.equal(t.got[0]!.result, 'wrong'); assert.equal(t.got[0]!.selectedIndex, 1); assert.equal(t.got[0]!.correctIndex, 2);
});

test('motor: corrección a medias (Angular pinta primero el error y luego la correcta) se guarda ya completa', () => {
  const t = setup(questionHtml(STEM, OPTS({})));
  t.engine.start(); t.clock.advance(1500);
  t.replace(questionHtml(STEM, OPTS({}, { times: 'show' })));
  t.engine.scan(); t.clock.advance(200);
  t.replace(questionHtml(STEM, OPTS({}, { times: 'show' }, { check: 'show' })));
  t.engine.scan(); t.clock.advance(600);
  assert.equal(t.got.length, 1);
  assert.equal(t.got[0]!.confidence, 'confirmed');
  assert.equal(t.got[0]!.correctIndex, 2);
});

test('motor: si la corrección queda incompleta, se guarda como PENDIENTE DE REVISIÓN', () => {
  const t = setup(questionHtml(STEM, OPTS({})));
  t.engine.start(); t.clock.advance(1500);
  t.replace(questionHtml(STEM, OPTS({}, { times: 'show' })));
  t.engine.scan(); t.clock.advance(600);
  assert.equal(t.got.length, 1);
  assert.equal(t.got[0]!.confidence, 'review');
  assert.equal(t.got[0]!.correctIndex, null);
});

test('motor: pregunta que YA aparece corregida al cargar (no la hemos visto contestar) no se registra', () => {
  const t = setup(questionHtml(STEM, OPTS({}, { times: 'show' }, { check: 'show' })));
  t.engine.start(); t.clock.advance(5000);
  assert.equal(t.got.length, 0);
});

test('motor: pregunta nueva en el mismo contenedor se captura; la misma contestada otra vez, también', () => {
  const t = setup(questionHtml(STEM, OPTS({})));
  t.engine.start(); t.clock.advance(1000);
  t.replace(questionHtml(STEM, OPTS({ check: 'show' }))); t.engine.scan(); t.clock.advance(600);
  assert.equal(t.got.length, 1);
  // Siguiente pregunta (otro enunciado)
  t.replace(questionHtml('¿Cuál es la velocidad máxima en autopista?', [{ text: '120 km/h' }, { text: '100 km/h' }]));
  t.engine.scan(); t.clock.advance(1500);
  t.replace(questionHtml('¿Cuál es la velocidad máxima en autopista?', [{ text: '120 km/h', times: 'show' }, { text: '100 km/h', check: 'show' }]));
  t.engine.scan(); t.clock.advance(600);
  assert.equal(t.got.length, 2);
  // Vuelve a salir la primera en otro test (indicadores ocultos de nuevo) y se contesta otra vez
  t.replace(questionHtml(STEM, OPTS({}))); t.engine.scan(); t.clock.advance(1000);
  t.replace(questionHtml(STEM, OPTS({ check: 'show' }))); t.engine.scan(); t.clock.advance(600);
  assert.equal(t.got.length, 3);
});

test('motor: el MutationObserver real detecta los cambios del DOM (sin llamar a scan)', async () => {
  const dom = makeDom(questionHtml(STEM, OPTS({})));
  const got: CapturePayload[] = [];
  const engine = new CaptureEngine({ doc: dom.window.document, adapter: aeolcloud, onCapture: (p) => got.push(p), settleMs: 40, debounceMs: 10 });
  engine.start();
  await new Promise((r) => setTimeout(r, 30));
  // Angular solo quita la clase ng-hide del icono (cambio de atributo, no de nodos)
  const icons = dom.window.document.querySelectorAll('.answer')[1]!.querySelector('.fa-check')!;
  icons.classList.remove('ng-hide');
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(got.length, 1);
  assert.equal(got[0]!.result, 'correct');
  engine.stop();
});

test('motor: tiempo de respuesta NO se informa si la pestaña estuvo oculta o es la carga inicial', () => {
  const t = setup(questionHtml(STEM, OPTS({})));
  t.engine.start(); t.clock.advance(3000);
  t.replace(questionHtml(STEM, OPTS({ check: 'show' }))); t.engine.scan(); t.clock.advance(600);
  assert.equal(t.got[0]!.responseMs, null, 'primera pregunta de la carga: tiempo no fiable');

  t.replace(questionHtml('Otra pregunta distinta', [{ text: 'A' }, { text: 'B' }])); t.engine.scan();
  t.clock.advance(2000);
  Object.defineProperty(t.doc, 'visibilityState', { value: 'hidden', configurable: true });
  t.doc.dispatchEvent(new t.dom.window.Event('visibilitychange'));
  Object.defineProperty(t.doc, 'visibilityState', { value: 'visible', configurable: true });
  t.replace(questionHtml('Otra pregunta distinta', [{ text: 'A', check: 'show' }, { text: 'B' }])); t.engine.scan(); t.clock.advance(600);
  assert.equal(t.got[1]!.responseMs, null);
});

test('motor: si pasas a la siguiente pregunta ANTES de los 500 ms, el acierto o fallo ya visto SE GUARDA (una vez)', () => {
  const t = setup(questionHtml('Pregunta previa', [{ text: 'A' }, { text: 'B' }]));
  t.engine.start();
  t.replace(questionHtml(STEM, OPTS({}))); t.engine.scan();
  t.clock.advance(3000);
  t.replace(questionHtml(STEM, OPTS({}, { check: 'show' }))); t.engine.scan(); // acierto visible
  t.clock.advance(150);                                                        // el usuario pulsa «Siguiente» muy rápido
  t.replace(questionHtml('Otra pregunta distinta', [{ text: 'X' }, { text: 'Y' }, { text: 'Z' }])); t.engine.scan();
  assert.equal(t.got.length, 1, 'el acierto no se pierde');
  assert.equal(t.got[0]!.result, 'correct'); assert.equal(t.got[0]!.confidence, 'confirmed');
  assert.equal(t.got[0]!.stem, STEM);
  t.clock.advance(5000); t.engine.scan();
  assert.equal(t.got.length, 1, 'sin duplicados');

  // Lo mismo con un fallo (elegida ✘ + correcta ✔ visibles).
  t.replace(questionHtml('Tercera', [{ text: 'P' }, { text: 'Q' }])); t.engine.scan();
  t.clock.advance(2000);
  t.replace(questionHtml('Tercera', [{ text: 'P', times: 'show' }, { text: 'Q', check: 'show' }])); t.engine.scan();
  t.clock.advance(100);
  t.replace(questionHtml('Cuarta', [{ text: 'M' }, { text: 'N' }])); t.engine.scan();
  assert.equal(t.got.length, 2);
  assert.equal(t.got[1]!.result, 'wrong'); assert.equal(t.got[1]!.selectedIndex, 0); assert.equal(t.got[1]!.correctIndex, 1);
});

test('motor: si te vas con una corrección dudosa (solo ✘), queda PENDIENTE DE REVISIÓN, no confirmada', () => {
  const t = setup(questionHtml('Pregunta previa', [{ text: 'A' }, { text: 'B' }]));
  t.engine.start();
  t.replace(questionHtml(STEM, OPTS({}))); t.engine.scan();
  t.clock.advance(2000);
  t.replace(questionHtml(STEM, OPTS({ times: 'show' }))); t.engine.scan();
  t.clock.advance(100);
  t.replace(questionHtml('Otra', [{ text: 'X' }, { text: 'Y' }])); t.engine.scan();
  assert.equal(t.got.length, 1);
  assert.equal(t.got[0]!.confidence, 'review');
});

test('motor: una pregunta que desaparece SIN haber sido contestada no genera captura', () => {
  const t = setup(questionHtml('Pregunta previa', [{ text: 'A' }, { text: 'B' }]));
  t.engine.start();
  t.replace(questionHtml(STEM, OPTS({}))); t.engine.scan();
  t.clock.advance(1000);
  t.replace(questionHtml('Otra', [{ text: 'X' }, { text: 'Y' }])); t.engine.scan();
  assert.equal(t.got.length, 0);
});

// ---------- Imagen de la pregunta (evidencia real: img.imagewrapper con data URI) ----------
import { imageHtml } from './helpers';
const IMG_A = 'AAAA', IMG_B = 'BBBB';
const srcOf = (b: string) => `data:image/png;base64, ${b}`;

test('imagen: el adaptador lee la única img.imagewrapper visible (aunque esté fuera de .question)', () => {
  const { doc } = setup(imageHtml(IMG_A) + questionHtml(STEM, OPTS({})));
  assert.equal(aeolcloud.read(doc.querySelector('.question')!)!.imageSrc, srcOf(IMG_A));
});

test('imagen: sin imagen, oculta (ng-hide), no-data-URI o dos imágenes distintas → null (no se adivina)', () => {
  const none = setup(questionHtml(STEM, OPTS({})));
  assert.equal(aeolcloud.read(none.doc.querySelector('.question')!)!.imageSrc, null);
  const hidden = setup(imageHtml(IMG_A, { hidden: true }) + questionHtml(STEM, OPTS({})));
  assert.equal(aeolcloud.read(hidden.doc.querySelector('.question')!)!.imageSrc, null);
  const remote = setup('<img class="imagewrapper" src="https://example.org/x.png">' + questionHtml(STEM, OPTS({})));
  assert.equal(aeolcloud.read(remote.doc.querySelector('.question')!)!.imageSrc, null);
  const two = setup(imageHtml(IMG_A) + imageHtml(IMG_B) + questionHtml(STEM, OPTS({})));
  assert.equal(aeolcloud.read(two.doc.querySelector('.question')!)!.imageSrc, null);
  // La misma imagen repetida (p. ej. una vista previa duplicada) sigue contando como una sola.
  const same = setup(imageHtml(IMG_A) + imageHtml(IMG_A) + questionHtml(STEM, OPTS({})));
  assert.equal(aeolcloud.read(same.doc.querySelector('.question')!)!.imageSrc, srcOf(IMG_A));
});

test('imagen: el motor adjunta la imagen a la captura; sin imagen no inventa ninguna', () => {
  const t = setup(questionHtml('Pregunta previa', [{ text: 'A' }, { text: 'B' }]));
  t.engine.start();
  t.doc.body.insertAdjacentHTML('afterbegin', imageHtml(IMG_A));
  t.replace(questionHtml(STEM, OPTS({}))); t.engine.scan();
  t.clock.advance(2000);
  t.replace(questionHtml(STEM, OPTS({}, { check: 'show' }))); t.engine.scan();
  t.clock.advance(600);
  assert.equal(t.got.length, 1);
  assert.equal(t.got[0]!.imageData, srcOf(IMG_A));

  const u = setup(questionHtml('Pregunta previa', [{ text: 'A' }, { text: 'B' }]));
  u.engine.start();
  u.replace(questionHtml(STEM, OPTS({}))); u.engine.scan();
  u.clock.advance(2000);
  u.replace(questionHtml(STEM, OPTS({}, { check: 'show' }))); u.engine.scan();
  u.clock.advance(600);
  assert.equal(u.got[0]!.imageData, null);
});

test('imagen: si la imagen cambia entre la pregunta sin corregir y la corrección (imagen vieja), NO se adjunta', () => {
  const t = setup(questionHtml('Pregunta previa', [{ text: 'A' }, { text: 'B' }]));
  t.engine.start();
  t.doc.body.insertAdjacentHTML('afterbegin', imageHtml(IMG_A)); // imagen de la pregunta anterior, aún en pantalla
  t.replace(questionHtml(STEM, OPTS({}))); t.engine.scan();
  t.clock.advance(1000);
  t.doc.querySelector('img.imagewrapper')!.setAttribute('src', srcOf(IMG_B)); // llega la imagen nueva
  t.replace(questionHtml(STEM, OPTS({}, { check: 'show' }))); t.engine.scan();
  t.clock.advance(600);
  assert.equal(t.got.length, 1, 'el intento se guarda igualmente');
  assert.equal(t.got[0]!.imageData, null, 'pero sin imagen dudosa');
});

test('imagen: pasar rápido a la siguiente pregunta también conserva la imagen del intento', () => {
  const t = setup(questionHtml('Pregunta previa', [{ text: 'A' }, { text: 'B' }]));
  t.engine.start();
  t.doc.body.insertAdjacentHTML('afterbegin', imageHtml(IMG_A));
  t.replace(questionHtml(STEM, OPTS({}))); t.engine.scan();
  t.clock.advance(2000);
  t.replace(questionHtml(STEM, OPTS({}, { check: 'show' }))); t.engine.scan();
  t.clock.advance(100);
  t.doc.querySelector('img.imagewrapper')!.remove();
  t.replace(questionHtml('Otra', [{ text: 'X' }, { text: 'Y' }])); t.engine.scan();
  assert.equal(t.got.length, 1);
  assert.equal(t.got[0]!.imageData, srcOf(IMG_A));
});
