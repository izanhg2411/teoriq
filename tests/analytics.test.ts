import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, trend } from '../src/analytics/stats';
import { classify, topicOf, UNCLASSIFIED } from '../src/analytics/categories';
import { mkAttempt, mkQuestion } from './helpers';

const T = 1_700_000_000_000;
const D = 86_400_000;

test('sin datos: todo vacío, sin cifras inventadas', () => {
  const s = computeStats([], []);
  assert.equal(s.total, 0); assert.equal(s.accuracy, null); assert.equal(s.enoughData, false);
  assert.deepEqual(s.topics, []);
});

test('totales, % de aciertos y fallos; los pendientes de revisión NO cuentan', () => {
  const q = mkQuestion();
  const att = [
    mkAttempt({ result: 'correct', ts: T }), mkAttempt({ result: 'wrong', ts: T + 1 }),
    mkAttempt({ result: 'correct', ts: T + 2 }), mkAttempt({ result: 'wrong', ts: T + 3 }),
    mkAttempt({ result: 'wrong', confidence: 'review', ts: T + 4 }),
  ];
  const s = computeStats([q], att);
  assert.equal(s.total, 4); assert.equal(s.correct, 2); assert.equal(s.wrong, 2);
  assert.equal(s.accuracy, 0.5); assert.equal(s.errorRate, 0.5);
  assert.equal(s.pendingReview, 1);
  assert.equal(s.enoughData, false, 'con 4 preguntas los datos son insuficientes');
});

test('errores repetidos y preguntas falladas varias veces', () => {
  const qa = mkQuestion({ key: 'a', stem: 'A' }), qb = mkQuestion({ key: 'b', stem: 'B' });
  const att = [
    mkAttempt({ questionKey: 'a', result: 'wrong', ts: T }), mkAttempt({ questionKey: 'a', result: 'wrong', ts: T + 5 }),
    mkAttempt({ questionKey: 'a', result: 'wrong', ts: T + 9 }), mkAttempt({ questionKey: 'b', result: 'wrong', ts: T + 3 }),
  ];
  const s = computeStats([qa, qb], att);
  assert.deepEqual(s.repeatedErrors.map((r) => [r.questionKey, r.wrongCount]), [['a', 3]]);
  assert.equal(s.recentWrong[0]!.attempt.ts, T + 9, 'las más recientes primero');
});

test('temas: ordena por tasa de error solo con datos suficientes y marca los que tienen pocos', () => {
  const vel = mkQuestion({ key: 'v', stem: 'Velocidad máxima', manualCategory: 'Velocidades' });
  const doc = mkQuestion({ key: 'd', stem: 'Seguro', manualCategory: 'Documentación' });
  const att = [
    ...Array.from({ length: 6 }, (_, i) => mkAttempt({ questionKey: 'v', result: i < 4 ? 'wrong' : 'correct', ts: T + i })),
    ...Array.from({ length: 6 }, (_, i) => mkAttempt({ questionKey: 'd', result: i < 1 ? 'wrong' : 'correct', ts: T + 10 + i })),
    mkAttempt({ questionKey: 'x', result: 'wrong', ts: T + 30 }),
  ];
  const s = computeStats([vel, doc, mkQuestion({ key: 'x', manualCategory: 'Maniobras' })], att);
  assert.equal(s.topics[0]!.topic, 'Velocidades');
  assert.ok(Math.abs(s.topics[0]!.errorRate - 4 / 6) < 1e-9);
  const man = s.topics.find((t) => t.topic === 'Maniobras')!;
  assert.equal(man.enoughData, false);
  assert.ok(!s.weakTopics.some((t) => t.topic === 'Maniobras'), 'un tema con 1 intento no es "débil"');
  assert.equal(s.weakTopics[0]!.topic, 'Velocidades');
});

test('evolución: agrupa por día', () => {
  const q = mkQuestion();
  const att = [
    mkAttempt({ result: 'wrong', ts: T }), mkAttempt({ result: 'correct', ts: T + 1000 }),
    mkAttempt({ result: 'correct', ts: T + 2 * D }), mkAttempt({ result: 'correct', ts: T + 2 * D + 5 }),
  ];
  const s = computeStats([q], att);
  assert.equal(s.evolution.length, 2);
  assert.equal(s.evolution[0]!.accuracy, 0.5); assert.equal(s.evolution[1]!.accuracy, 1);
});

test('tendencia: compara la última semana con la anterior', () => {
  const att = [
    mkAttempt({ result: 'wrong', ts: T - 10 * D }), mkAttempt({ result: 'correct', ts: T - 9 * D }),
    mkAttempt({ result: 'correct', ts: T - 1 * D }), mkAttempt({ result: 'correct', ts: T - 2 * D }),
  ];
  const t = trend(att, T);
  assert.equal(t.previous, 0.5); assert.equal(t.recent, 1);
});

test('clasificador local por palabras clave (y corrección manual manda)', () => {
  assert.equal(classify('Los sistemas de seguridad pasiva incluyen...', ['El cinturón de seguridad', 'El ABS', 'Ninguna']), 'Seguridad activa y pasiva');
  assert.equal(classify('¿Qué tasa de alcohol en sangre está permitida?', ['0,25 mg/l', '0,15 mg/l']), 'Alcohol y drogas');
  assert.equal(classify('¿Cuántos puntos se pierden por esta infracción grave?', ['4', '6']), 'Sanciones y puntos');
  assert.equal(classify('Pregunta enigmática', ['uno', 'dos']), null);
  assert.deepEqual(topicOf(mkQuestion({ stem: 'Pregunta enigmática', options: ['a', 'b'] })), { topic: UNCLASSIFIED, origin: 'none' });
  const q = mkQuestion({ stem: '¿Qué tasa de alcohol?', options: ['a', 'b'], manualCategory: 'Maniobras' });
  assert.deepEqual(topicOf(q), { topic: 'Maniobras', origin: 'manual' });
  assert.equal(topicOf(mkQuestion({ stem: '¿Qué tasa de alcohol?', options: ['a', 'b'] })).origin, 'auto');
});
