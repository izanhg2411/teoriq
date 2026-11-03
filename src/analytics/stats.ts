// Estadísticas. Solo cuentan intentos CONFIRMADOS (los pendientes de revisión no se mezclan con los datos fiables).
import { DAY_MS, MIN_ATTEMPTS_GLOBAL, MIN_ATTEMPTS_TOPIC, type Attempt, type Question } from '../core/types';
import { topicOf } from './categories';

export const isCounted = (a: Attempt) => a.confidence === 'confirmed' && a.result !== 'unknown';

export interface TopicStat {
  topic: string;
  answered: number;
  wrong: number;
  errorRate: number; // 0..1
  /** Con pocos intentos la tasa no es fiable y el tema no se ordena como "débil". */
  enoughData: boolean;
}
export interface DayPoint { day: string; answered: number; correct: number; accuracy: number }
export interface RepeatedError { questionKey: string; stem: string; wrongCount: number; answered: number; lastWrongTs: number }

export interface Stats {
  total: number;
  correct: number;
  wrong: number;
  accuracy: number | null; // 0..1; null si no hay datos
  errorRate: number | null;
  pendingReview: number;
  enoughData: boolean;
  topics: TopicStat[]; // ordenados: temas con datos suficientes por tasa de error desc, luego el resto
  weakTopics: TopicStat[];
  evolution: DayPoint[];
  repeatedErrors: RepeatedError[]; // preguntas falladas 2+ veces
  recentWrong: { attempt: Attempt; question: Question | undefined }[];
}

/** Día local YYYY-MM-DD de un timestamp. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function computeStats(questions: Question[], attempts: Attempt[]): Stats {
  const qmap = new Map(questions.map((q) => [q.key, q]));
  const counted = attempts.filter(isCounted).sort((a, b) => a.ts - b.ts);
  const correct = counted.filter((a) => a.result === 'correct').length;
  const wrong = counted.length - correct;

  const byTopic = new Map<string, { answered: number; wrong: number }>();
  for (const a of counted) {
    const q = qmap.get(a.questionKey);
    const topic = q ? topicOf(q).topic : 'Sin clasificar';
    const t = byTopic.get(topic) ?? { answered: 0, wrong: 0 };
    t.answered++;
    if (a.result === 'wrong') t.wrong++;
    byTopic.set(topic, t);
  }
  const topics: TopicStat[] = [...byTopic.entries()].map(([topic, t]) => ({
    topic, answered: t.answered, wrong: t.wrong, errorRate: t.wrong / t.answered, enoughData: t.answered >= MIN_ATTEMPTS_TOPIC,
  }));
  topics.sort((a, b) => Number(b.enoughData) - Number(a.enoughData) || b.errorRate - a.errorRate || b.answered - a.answered);
  const weakTopics = topics.filter((t) => t.enoughData && t.errorRate > 0 && t.topic !== 'Sin clasificar').slice(0, 5);

  const days = new Map<string, { answered: number; correct: number }>();
  for (const a of counted) {
    const k = dayKey(a.ts);
    const d = days.get(k) ?? { answered: 0, correct: 0 };
    d.answered++;
    if (a.result === 'correct') d.correct++;
    days.set(k, d);
  }
  const evolution = [...days.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([day, d]) => ({ day, ...d, accuracy: d.correct / d.answered }));

  const perQ = new Map<string, { wrong: number; answered: number; lastWrong: number }>();
  for (const a of counted) {
    const p = perQ.get(a.questionKey) ?? { wrong: 0, answered: 0, lastWrong: 0 };
    p.answered++;
    if (a.result === 'wrong') { p.wrong++; p.lastWrong = Math.max(p.lastWrong, a.ts); }
    perQ.set(a.questionKey, p);
  }
  const repeatedErrors: RepeatedError[] = [...perQ.entries()]
    .filter(([, p]) => p.wrong >= 2)
    .map(([questionKey, p]) => ({ questionKey, stem: qmap.get(questionKey)?.stem ?? '(pregunta eliminada)', wrongCount: p.wrong, answered: p.answered, lastWrongTs: p.lastWrong }))
    .sort((a, b) => b.wrongCount - a.wrongCount || b.lastWrongTs - a.lastWrongTs);

  const recentWrong = counted.filter((a) => a.result === 'wrong').slice(-10).reverse()
    .map((attempt) => ({ attempt, question: qmap.get(attempt.questionKey) }));

  return {
    total: counted.length, correct, wrong,
    accuracy: counted.length ? correct / counted.length : null,
    errorRate: counted.length ? wrong / counted.length : null,
    pendingReview: attempts.filter((a) => a.confidence === 'review').length,
    enoughData: counted.length >= MIN_ATTEMPTS_GLOBAL,
    topics, weakTopics, evolution, repeatedErrors, recentWrong,
  };
}

/** Precisión de los últimos `days` días frente a los `days` anteriores (para comparar evolución). */
export function trend(attempts: Attempt[], now: number, days = 7): { recent: number | null; previous: number | null; recentN: number; previousN: number } {
  const c = attempts.filter(isCounted);
  const r = c.filter((a) => a.ts > now - days * DAY_MS);
  const p = c.filter((a) => a.ts <= now - days * DAY_MS && a.ts > now - 2 * days * DAY_MS);
  const acc = (x: Attempt[]) => (x.length ? x.filter((a) => a.result === 'correct').length / x.length : null);
  return { recent: acc(r), previous: acc(p), recentN: r.length, previousN: p.length };
}
