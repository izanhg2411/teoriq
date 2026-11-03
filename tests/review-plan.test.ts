import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOX_INTERVAL_DAYS, RELEARN_MS, deriveSrs, dueQueue, deriveAll, maxIntervalDays, priority } from '../src/review/srs';
import { buildPlan, daysUntil, secondsPerQuestion } from '../src/study-plan/plan';
import { DEFAULT_SETTINGS } from '../src/core/types';
import { mkAttempt, mkQuestion } from './helpers';

const NOW = new Date(2026, 10, 1, 10, 0, 0).getTime(); // 1 nov 2026, hora local
const D = 86_400_000;
const att = (key: string, result: 'correct' | 'wrong', ts: number) => mkAttempt({ questionKey: key, result, ts });

test('SRS: un fallo vuelve a salir pronto (10 min) y deja la pregunta en la caja 0', () => {
  const s = deriveSrs([att('q', 'wrong', NOW)])!;
  assert.equal(s.box, 0); assert.equal(s.lapses, 1);
  assert.equal(s.dueTs, NOW + RELEARN_MS);
});

test('SRS: los aciertos seguidos espacian cada vez más', () => {
  const s = [0, 1, 2, 3, 4, 5, 6].map((i) => deriveSrs(Array.from({ length: i + 1 }, (_, j) => att('q', 'correct', NOW + j)))!);
  assert.deepEqual(s.map((x) => x.box), [1, 2, 3, 4, 5, 5, 5]);
  assert.equal(s[0]!.dueTs, NOW + BOX_INTERVAL_DAYS[1] * D);
  assert.equal(s[2]!.dueTs, NOW + 2 + BOX_INTERVAL_DAYS[3] * D);
  assert.equal(s[6]!.dueTs - (NOW + 6), BOX_INTERVAL_DAYS[5] * D);
});

test('SRS: volver a fallar recupera prioridad y vuelve a la caja 0', () => {
  const good = deriveSrs([att('q', 'correct', NOW), att('q', 'correct', NOW + 1), att('q', 'correct', NOW + 2)])!;
  const relapse = deriveSrs([att('q', 'correct', NOW), att('q', 'correct', NOW + 1), att('q', 'correct', NOW + 2), att('q', 'wrong', NOW + 3)])!;
  assert.equal(good.box, 3); assert.equal(relapse.box, 0); assert.equal(relapse.lapses, 1);
  assert.ok(priority(relapse, NOW + 3 + RELEARN_MS) > priority({ ...good, dueTs: NOW }, NOW + 3 + RELEARN_MS));
});

test('SRS: ignora intentos pendientes de revisión y los orden de llegada no importa', () => {
  const s = deriveSrs([att('q', 'correct', NOW + 5), mkAttempt({ questionKey: 'q', result: 'wrong', confidence: 'review', ts: NOW + 9 }), att('q', 'wrong', NOW)])!;
  assert.equal(s.box, 1); assert.equal(s.lapses, 1); assert.equal(s.lastResult, 'correct');
});

test('SRS: con examen cercano los intervalos se acortan', () => {
  assert.equal(maxIntervalDays(null), Infinity);
  assert.equal(maxIntervalDays(10), 5);
  assert.equal(maxIntervalDays(1), 1);
  const s = deriveSrs([att('q', 'correct', NOW), att('q', 'correct', NOW + 1), att('q', 'correct', NOW + 2), att('q', 'correct', NOW + 3)], 2)!;
  assert.equal(s.dueTs, NOW + 3 + 2 * D);
});

test('SRS: cola de repaso = vencidas, ordenadas (fallada reciente antes que acierto antiguo)', () => {
  const states = deriveAll([
    att('ok', 'correct', NOW - 3 * D), att('bad', 'wrong', NOW - 1 * D), att('fut', 'correct', NOW),
  ]);
  const q = dueQueue(states, NOW + 1000).map((s) => s.questionKey);
  assert.deepEqual(q, ['bad', 'ok']);
});

// ---------------- Plan de estudio ----------------
function world() {
  const qs = [
    mkQuestion({ key: 'v1', stem: 'Velocidad en autopista', options: ['120', '100'], correctText: '120', manualCategory: 'Velocidades' }),
    mkQuestion({ key: 'v2', stem: 'Velocidad en ciudad', options: ['50', '30'], correctText: '50', manualCategory: 'Velocidades' }),
    mkQuestion({ key: 'd1', stem: 'Seguro obligatorio', options: ['Sí', 'No'], correctText: 'Sí', manualCategory: 'Documentación' }),
    mkQuestion({ key: 'n1', stem: 'Sin respuesta confirmada', options: ['a', 'b'], correctText: null }),
  ];
  const as = [
    att('v1', 'wrong', NOW - 3 * D), att('v1', 'wrong', NOW - 2 * D), // fallada 2 veces, vencida
    att('v2', 'wrong', NOW - 1 * D),
    att('d1', 'correct', NOW - 2 * D), att('d1', 'correct', NOW - 1 * D + 5), // acertada, no vence hoy
    att('n1', 'wrong', NOW - 2 * D),
  ];
  return { qs, as };
}

test('plan: prioriza lo más fallado y vencido; excluye preguntas sin respuesta confirmada', () => {
  const { qs, as } = world();
  const plan = buildPlan(qs, as, { ...DEFAULT_SETTINGS, questionsPerDay: 10 }, NOW);
  assert.deepEqual(plan.today.map((i) => i.questionKey).slice(0, 2), ['v1', 'v2']);
  assert.ok(!plan.today.some((i) => i.questionKey === 'n1'));
  assert.ok(plan.today[0]!.reasons.some((r) => r.includes('Fallada 2 veces')));
});

test('plan: respeta el presupuesto diario (por nº de preguntas y por minutos)', () => {
  const { qs, as } = world();
  const p1 = buildPlan(qs, as, { ...DEFAULT_SETTINGS, questionsPerDay: 1 }, NOW);
  assert.equal(p1.today.length, 1); assert.equal(p1.budget, 1);
  assert.ok(p1.warnings.some((w) => w.includes('hoy caben 1')));
  const p2 = buildPlan(qs, as, { ...DEFAULT_SETTINGS, questionsPerDay: 100, minutesPerDay: 1 }, NOW);
  assert.equal(p2.budget, Math.floor(60 / 45));
});

test('plan: avisa de datos insuficientes y no inventa nada sin preguntas', () => {
  const { qs, as } = world();
  assert.equal(buildPlan(qs, as, DEFAULT_SETTINGS, NOW).enoughData, false);
  assert.ok(buildPlan(qs, as, DEFAULT_SETTINGS, NOW).warnings[0]!.includes('pocos datos'));
  const empty = buildPlan([], [], DEFAULT_SETTINGS, NOW);
  assert.deepEqual([empty.today.length, empty.warnings.length, empty.dueToday], [0, 0, 0]);
});

test('plan: fecha de examen -> días restantes, aviso de sobrecarga y fecha pasada', () => {
  assert.equal(daysUntil('2026-11-11', NOW), 10);
  assert.equal(daysUntil('2026-11-01', NOW), 0);
  assert.equal(daysUntil('2026-10-30', NOW), -2);
  assert.equal(daysUntil(null, NOW), null);
  const { qs, as } = world();
  const past = buildPlan(qs, as, { ...DEFAULT_SETTINGS, examDate: '2026-10-01' }, NOW);
  assert.ok(past.warnings.some((w) => w.includes('ya ha pasado')));
  const tight = buildPlan(qs, as, { ...DEFAULT_SETTINGS, examDate: '2026-11-03', questionsPerDay: 1 }, NOW);
  assert.equal(tight.daysToExam, 2);
  assert.ok(tight.warnings.some((w) => w.includes('no te dará tiempo')));
});

test('plan: previsión de vencimientos por día y temas a reforzar', () => {
  const { qs, as } = world();
  const many = Array.from({ length: 8 }, (_, i) => att('v1', i < 6 ? 'wrong' : 'correct', NOW - 20 * D + i));
  const plan = buildPlan(qs, [...as, ...many], DEFAULT_SETTINGS, NOW);
  assert.equal(plan.forecast.length, 7);
  assert.ok(plan.forecast[0]!.due >= 2);
  assert.equal(plan.topicFocus[0]!.topic, 'Velocidades');
});

test('tiempo por pregunta: usa la mediana medida solo con suficientes datos', () => {
  assert.equal(secondsPerQuestion([att('q', 'correct', NOW)]), 45);
  const many = Array.from({ length: 12 }, (_, i) => mkAttempt({ ts: NOW + i, responseMs: 20_000 }));
  assert.equal(secondsPerQuestion(many), 20);
});
