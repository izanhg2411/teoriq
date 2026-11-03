// Plan de estudio diario SIN IA: combina vencimientos del repaso espaciado, frecuencia de fallos,
// repetición de fallos, tiempo desde el último repaso y nº de preguntas disponibles por tema.
import { DAY_MS, MIN_ATTEMPTS_GLOBAL, type Attempt, type Question, type Settings } from '../core/types';
import { topicOf } from '../analytics/categories';
import { computeStats, isCounted } from '../analytics/stats';
import { deriveAll, dueQueue, maxIntervalDays, priority, type SrsState } from '../review/srs';

export interface PlanItem {
  questionKey: string;
  stem: string;
  topic: string;
  score: number;
  reasons: string[];
}
export interface ForecastDay { date: string; due: number }
export interface Plan {
  today: PlanItem[];
  budget: number;
  secondsPerQuestion: number;
  dueToday: number;
  daysToExam: number | null;
  topicFocus: { topic: string; errorRate: number; answered: number }[];
  forecast: ForecastDay[];
  warnings: string[];
  enoughData: boolean;
}

export const DEFAULT_SECONDS_PER_QUESTION = 45;

/** Días naturales hasta una fecha YYYY-MM-DD (hora local). Negativo si ya pasó. */
export function daysUntil(dateStr: string | null, now: number): number | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const t = new Date(now);
  const a = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!);
  const b = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((a - b) / DAY_MS);
}

function endOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Mediana del tiempo de respuesta medido, acotada; si no hay datos fiables, valor por defecto. */
export function secondsPerQuestion(attempts: Attempt[]): number {
  const ms = attempts.filter((a) => isCounted(a) && a.responseMs !== null).slice(-100).map((a) => a.responseMs!).sort((x, y) => x - y);
  if (ms.length < 10) return DEFAULT_SECONDS_PER_QUESTION;
  const med = ms[Math.floor(ms.length / 2)]!;
  return Math.min(120, Math.max(15, Math.round(med / 1000)));
}

export function buildPlan(questions: Question[], attempts: Attempt[], settings: Settings, now: number): Plan {
  const stats = computeStats(questions, attempts);
  const daysToExam = daysUntil(settings.examDate, now);
  const states = deriveAll(attempts, maxIntervalDays(daysToExam));
  const qmap = new Map(questions.map((q) => [q.key, q]));
  const reviewable = (s: SrsState) => !!qmap.get(s.questionKey)?.correctText;

  const spq = secondsPerQuestion(attempts);
  const byTime = Math.max(1, Math.floor((settings.minutesPerDay * 60) / spq));
  const budget = Math.max(1, Math.min(settings.questionsPerDay, byTime));

  const topicStat = new Map(stats.topics.map((t) => [t.topic, t]));
  const smoothedErr = (topic: string) => { const t = topicStat.get(topic); return t ? (t.wrong + 1) / (t.answered + 2) : 0.5; };

  const eod = endOfDay(now);
  const due = dueQueue(states, eod).filter(reviewable);
  // Disponibilidad por tema: más preguntas pendientes en un tema => ese tema reclama más hueco.
  const dueByTopic = new Map<string, number>();
  for (const s of due) { const t = topicOf(qmap.get(s.questionKey)!).topic; dueByTopic.set(t, (dueByTopic.get(t) ?? 0) + 1); }

  const toItem = (s: SrsState, extraReason?: string): PlanItem => {
    const q = qmap.get(s.questionKey)!;
    const topic = topicOf(q).topic;
    const share = due.length ? (dueByTopic.get(topic) ?? 0) / due.length : 0;
    const factor = 1 + 0.5 * smoothedErr(topic) + 0.25 * share;
    const reasons: string[] = [];
    if (extraReason) reasons.push(extraReason);
    if (s.lastResult === 'wrong') reasons.push('Falló la última vez');
    if (s.lapses >= 2) reasons.push(`Fallada ${s.lapses} veces`);
    const overdue = Math.floor((now - s.dueTs) / DAY_MS);
    if (overdue >= 1) reasons.push(`Pendiente desde hace ${overdue} día${overdue === 1 ? '' : 's'}`);
    if (smoothedErr(topic) > 0.35 && (topicStat.get(topic)?.enoughData ?? false)) reasons.push('Tema con muchos fallos');
    if (!reasons.length) reasons.push('Toca repasarla');
    return { questionKey: s.questionKey, stem: q.stem, topic, score: priority(s, now) * factor, reasons };
  };

  const items = due.map((s) => toItem(s)).sort((a, b) => b.score - a.score);
  let today = items.slice(0, budget);
  // Si sobra hueco, refuerza lo ya fallado que aún no vence (prioriza lo que más se ha fallado).
  if (today.length < budget) {
    const chosen = new Set(today.map((i) => i.questionKey));
    const extra = [...states.values()]
      .filter((s) => !chosen.has(s.questionKey) && s.lapses > 0 && reviewable(s))
      .map((s) => toItem(s, 'Refuerzo anticipado'))
      .sort((a, b) => b.score - a.score)
      .slice(0, budget - today.length);
    today = today.concat(extra);
  }

  const forecast: ForecastDay[] = [];
  const horizon = Math.min(7, daysToExam !== null && daysToExam > 0 ? daysToExam : 7);
  for (let d = 0; d < horizon; d++) {
    const start = d === 0 ? 0 : endOfDay(now + (d - 1) * DAY_MS) + 1;
    const end = endOfDay(now + d * DAY_MS);
    const n = [...states.values()].filter((s) => reviewable(s) && s.dueTs >= start && s.dueTs <= end).length;
    const dt = new Date(now + d * DAY_MS);
    forecast.push({ date: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`, due: n });
  }

  const warnings: string[] = [];
  const enoughData = stats.total >= MIN_ATTEMPTS_GLOBAL;
  if (!enoughData) warnings.push(`Aún hay pocos datos (${stats.total} de ${MIN_ATTEMPTS_GLOBAL} preguntas): el plan es orientativo.`);
  if (settings.examDate && daysToExam !== null && daysToExam < 0) warnings.push('La fecha de examen configurada ya ha pasado.');
  if (due.length > budget) warnings.push(`Tienes ${due.length} preguntas pendientes y hoy caben ${budget}: se han elegido las más urgentes.`);
  if (daysToExam !== null && daysToExam > 0) {
    const backlog = [...states.values()].filter((s) => reviewable(s) && s.dueTs <= endOfDay(now + daysToExam * DAY_MS)).length;
    if (backlog > budget * daysToExam) warnings.push(`Con ${budget} preguntas al día no te dará tiempo a repasar todo lo pendiente antes del examen (${backlog} por ver en ${daysToExam} días).`);
  }
  if (!questions.length) warnings.length = 0;

  return {
    today, budget, secondsPerQuestion: spq, dueToday: due.length, daysToExam,
    topicFocus: stats.weakTopics.slice(0, 3).map((t) => ({ topic: t.topic, errorRate: t.errorRate, answered: t.answered })),
    forecast, warnings, enoughData,
  };
}
