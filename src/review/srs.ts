// Repetición espaciada tipo Leitner con cajas. El estado se DERIVA siempre del historial de intentos
// (no se guarda), así que importar/fusionar copias o borrar un intento nunca deja el repaso incoherente.
import { DAY_MS, type Attempt } from '../core/types';
import { isCounted } from '../analytics/stats';

/** Intervalo (días) tras acertar estando en cada caja. Caja 0 = pendiente de aprender. */
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const;
export const MAX_BOX = BOX_INTERVAL_DAYS.length - 1;
/** Tras un fallo la pregunta vuelve a salir pronto (misma sesión de estudio). */
export const RELEARN_MS = 10 * 60_000;

export interface SrsState {
  questionKey: string;
  box: number;
  lapses: number; // veces que se ha fallado
  answered: number;
  lastTs: number;
  lastResult: 'correct' | 'wrong';
  dueTs: number;
}

/** Si hay examen cercano, los intervalos largos no tienen sentido: se limitan a la mitad del tiempo restante. */
export function maxIntervalDays(daysToExam: number | null): number {
  if (daysToExam === null || daysToExam < 0) return Infinity;
  return Math.max(1, Math.floor(daysToExam / 2));
}

export function deriveSrs(attempts: Attempt[], capDays = Infinity): SrsState | null {
  const list = attempts.filter(isCounted).sort((a, b) => a.ts - b.ts);
  if (!list.length) return null;
  let box = 0, lapses = 0;
  let dueTs = 0;
  for (const a of list) {
    if (a.result === 'wrong') {
      box = 0; lapses++;
      dueTs = a.ts + RELEARN_MS;
    } else {
      box = Math.min(box + 1, MAX_BOX);
      dueTs = a.ts + Math.min(BOX_INTERVAL_DAYS[box]!, capDays) * DAY_MS;
    }
  }
  const last = list[list.length - 1]!;
  return {
    questionKey: last.questionKey, box, lapses, answered: list.length, lastTs: last.ts,
    lastResult: last.result as 'correct' | 'wrong', dueTs,
  };
}

export function deriveAll(attempts: Attempt[], capDays = Infinity): Map<string, SrsState> {
  const by = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const l = by.get(a.questionKey) ?? [];
    l.push(a);
    by.set(a.questionKey, l);
  }
  const out = new Map<string, SrsState>();
  for (const [k, l] of by) {
    const s = deriveSrs(l, capDays);
    if (s) out.set(k, s);
  }
  return out;
}

export const isDue = (s: SrsState, now: number) => s.dueTs <= now;

/** Prioridad (mayor = antes): fallos recientes y repetidos pesan más; el retraso suma de forma acotada. */
export function priority(s: SrsState, now: number): number {
  const overdueDays = Math.max(0, (now - s.dueTs) / DAY_MS);
  const lapseRate = s.lapses / s.answered;
  return (s.box === 0 ? 10 : 0) + s.lapses * 3 + lapseRate * 5 + Math.min(overdueDays, 14) * 0.5 + (s.lastResult === 'wrong' ? 4 : 0);
}

/** Cola de repaso: preguntas vencidas ordenadas por prioridad. */
export function dueQueue(states: Map<string, SrsState>, now: number): SrsState[] {
  return [...states.values()].filter((s) => isDue(s, now)).sort((a, b) => priority(b, now) - priority(a, now) || a.dueTs - b.dueTs);
}
