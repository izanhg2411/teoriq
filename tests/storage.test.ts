import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryKV } from '../src/storage/kv';
import { Repo, DUPLICATE_WINDOW_MS } from '../src/storage/repo';
import { parseBackup } from '../src/storage/backup';
import { mkPayload } from './helpers';

const T0 = 1_700_000_000_000;

test('guarda intento y pregunta; la correcta confirmada queda en la pregunta', async () => {
  const repo = new Repo(new MemoryKV());
  const r = await repo.record(mkPayload({ ts: T0, selectedIndex: 0, correctIndex: 1, result: 'wrong' }));
  assert.equal(r.status, 'saved');
  const s = await repo.load();
  assert.equal(s.attempts.length, 1); assert.equal(s.questions.length, 1);
  assert.equal(s.questions[0]!.correctText, 'Ceda el paso');
  assert.equal(s.attempts[0]!.selectedText, 'Prohibido girar');
});

test('duplicados: misma captura dentro de la ventana no se guarda; fuera de la ventana, sí', async () => {
  const repo = new Repo(new MemoryKV());
  await repo.record(mkPayload({ ts: T0 }));
  assert.equal((await repo.record(mkPayload({ ts: T0 + 1000 }))).status, 'duplicate');
  assert.equal((await repo.record(mkPayload({ ts: T0 + DUPLICATE_WINDOW_MS + 1 }))).status, 'saved');
  // distinto resultado cerca en el tiempo: es otro intento
  assert.equal((await repo.record(mkPayload({ ts: T0 + DUPLICATE_WINDOW_MS + 2, selectedIndex: 0, result: 'wrong' }))).status, 'saved');
  assert.equal((await repo.load()).attempts.length, 3);
});

test('envíos simultáneos no se pierden ni se duplican (cola de escritura)', async () => {
  const repo = new Repo(new MemoryKV());
  const ps = [];
  for (let i = 0; i < 20; i++) ps.push(repo.record(mkPayload({ key: `aeolcloud:q${i}`, ts: T0 + i })));
  ps.push(repo.record(mkPayload({ key: 'aeolcloud:q0', ts: T0 + 5 }))); // duplicado de q0
  await Promise.all(ps);
  const s = await repo.load();
  assert.equal(s.attempts.length, 20); assert.equal(s.questions.length, 20);
});

test('captura en revisión no fija la respuesta correcta y se puede resolver a mano', async () => {
  const repo = new Repo(new MemoryKV());
  const { attempt } = await repo.record(mkPayload({ ts: T0, confidence: 'review', correctIndex: null, selectedIndex: 0, result: 'wrong' }));
  let s = await repo.load();
  assert.equal(s.questions[0]!.correctText, null);
  assert.equal(await repo.resolve(attempt.id, 0, 1), true);
  s = await repo.load();
  assert.equal(s.attempts[0]!.confidence, 'confirmed'); assert.equal(s.attempts[0]!.result, 'wrong');
  assert.equal(s.questions[0]!.correctText, 'Ceda el paso');
  assert.equal(await repo.resolve(attempt.id, 9, 1), false);
});

test('repaso: necesita respuesta correcta confirmada', async () => {
  const kv = new MemoryKV();
  const repo = new Repo(kv, () => T0 + 99);
  await repo.record(mkPayload({ ts: T0, confidence: 'review', correctIndex: null, selectedIndex: 0, result: 'wrong' }));
  assert.equal(await repo.recordReview('aeolcloud:q1', true, 'Ceda el paso'), null);
  await repo.record(mkPayload({ ts: T0 + 10_000 }));
  const a = await repo.recordReview('aeolcloud:q1', false, 'Stop');
  assert.equal(a!.result, 'wrong'); assert.equal(a!.source, 'review');
});

test('exportar → importar (fusión) recupera todo sin duplicar; reemplazar deja solo lo importado', async () => {
  const a = new Repo(new MemoryKV(), () => T0);
  await a.record(mkPayload({ ts: T0 }));
  await a.record(mkPayload({ key: 'aeolcloud:q2', stem: 'Otra', ts: T0 + 10_000, selectedIndex: 0, result: 'wrong' }));
  await a.setCategory('aeolcloud:q2', 'Velocidades');
  await a.setSettings({ examDate: '2026-12-01', minutesPerDay: 20 });
  const json = await a.exportJson();

  const b = new Repo(new MemoryKV());
  const r = await b.importJson(json, 'merge');
  assert.deepEqual(r.ok && [r.questions, r.attempts], [2, 2]);
  await b.importJson(json, 'merge'); // idempotente
  const s = await b.load();
  assert.equal(s.attempts.length, 2);
  assert.equal(s.questions.find((q) => q.key === 'aeolcloud:q2')!.manualCategory, 'Velocidades');
  assert.equal(s.settings.examDate, '2026-12-01');

  await b.record(mkPayload({ key: 'aeolcloud:q9', ts: T0 + 99_000 }));
  await b.importJson(json, 'replace');
  assert.equal((await b.load()).attempts.length, 2);
});

test('importación rechaza archivos inválidos con mensaje claro', () => {
  assert.equal(parseBackup('esto no es json').ok, false);
  assert.equal(parseBackup('{"app":"otra"}').ok, false);
  assert.equal(parseBackup('{"app":"teoriq","schema":99,"questions":[],"attempts":[]}').ok, false);
  const r = parseBackup(JSON.stringify({ app: 'teoriq', schema: 1, questions: [{ nope: 1 }], attempts: [{ id: 'x' }] }));
  assert.ok(r.ok && r.skipped === 2 && r.state.attempts.length === 0);
});

// ---------- Imágenes de las preguntas ----------
import { IMG_BUDGET_CHARS, IMG_MAX_CHARS } from '../src/storage/repo';
import { buildBackup, mergeStates } from '../src/storage/backup';
const JPG = (n: string) => `data:image/jpeg;base64,${n}`;

test('imagen: se guarda una vez por pregunta (la primera válida gana) y viaja en la pregunta', async () => {
  const repo = new Repo(new MemoryKV());
  await repo.record(mkPayload({ ts: T0, imageData: JPG('AAAA') }));
  await repo.record(mkPayload({ ts: T0 + 60_000, imageData: JPG('BBBB') }));
  const s = await repo.load();
  assert.equal(s.questions[0]!.imageData, JPG('AAAA'));
  // Una pregunta vista antes sin imagen la recibe cuando se vuelve a contestar con imagen.
  const repo2 = new Repo(new MemoryKV());
  await repo2.record(mkPayload({ ts: T0 }));
  assert.equal((await repo2.load()).questions[0]!.imageData ?? null, null);
  await repo2.record(mkPayload({ ts: T0 + 60_000, imageData: JPG('CCCC') }));
  assert.equal((await repo2.load()).questions[0]!.imageData, JPG('CCCC'));
});

test('imagen: se rechaza lo que no es JPEG reducido o es demasiado grande; el intento se guarda igual', async () => {
  const repo = new Repo(new MemoryKV());
  const r1 = await repo.record(mkPayload({ ts: T0, imageData: 'data:image/png;base64,AAAA' }));
  assert.equal(r1.status, 'saved');
  const r2 = await repo.record(mkPayload({ ts: T0 + 60_000, imageData: JPG('A'.repeat(IMG_MAX_CHARS)) }));
  assert.equal(r2.status, 'saved');
  const r3 = await repo.record(mkPayload({ ts: T0 + 120_000, imageData: '<script>alert(1)</script>' }));
  assert.equal(r3.status, 'saved');
  const s = await repo.load();
  assert.equal(s.attempts.length, 3);
  assert.equal(s.questions[0]!.imageData ?? null, null);
});

test('imagen: el presupuesto de espacio se respeta (no se guardan más imágenes, sí los intentos)', async () => {
  const kv = new MemoryKV();
  const repo = new Repo(kv);
  // Una pregunta ya existente que consume casi todo el presupuesto.
  kv.data['q:otra'] = { key: 'otra', platform: 'aeolcloud', externalId: null, stem: 'x', options: ['a', 'b'], correctText: null, platformCategory: null, manualCategory: null, imageData: JPG('A'.repeat(IMG_BUDGET_CHARS - 100)), firstSeen: 1, lastSeen: 1 };
  const r = await repo.record(mkPayload({ ts: T0, imageData: JPG('B'.repeat(500)) }));
  assert.equal(r.status, 'saved');
  const s = await repo.load();
  const mine = s.questions.find((q) => q.key !== 'otra')!;
  assert.equal(mine.imageData ?? null, null);
  assert.equal(s.attempts.length, 1);
});

test('imagen: exportar → importar conserva la imagen; una imagen inválida de la copia se descarta; fusionar no la pierde', async () => {
  const repo = new Repo(new MemoryKV());
  await repo.record(mkPayload({ ts: T0, imageData: JPG('AAAA') }));
  const json = await repo.exportJson();
  const parsed = parseBackup(json);
  assert.ok(parsed.ok);
  if (parsed.ok) assert.equal(parsed.state.questions[0]!.imageData, JPG('AAAA'));

  const tampered = JSON.parse(json);
  tampered.questions[0].imageData = 'javascript:alert(1)';
  const p2 = parseBackup(JSON.stringify(tampered));
  assert.ok(p2.ok);
  if (p2.ok) assert.equal(p2.state.questions[0]!.imageData, null);

  // Copia antigua (sin campo imageData) sigue importándose.
  const old = JSON.parse(json); delete old.questions[0].imageData;
  assert.ok(parseBackup(JSON.stringify(old)).ok);

  // Fusionar: la imagen de una copia completa a una pregunta local sin imagen.
  const base = (await new Repo(new MemoryKV()).load());
  const withoutImg = { ...parsed.ok ? parsed.state : base, questions: parsed.ok ? parsed.state.questions.map((q) => ({ ...q, imageData: null })) : [] };
  if (parsed.ok) assert.equal(mergeStates(withoutImg, parsed.state).questions[0]!.imageData, JPG('AAAA'));
  void buildBackup;
});
