// Exportación / importación de copias de seguridad (JSON) y fusión de datos. Funciones puras.
import { DEFAULT_SETTINGS, type Attempt, type Question, type Settings } from '../core/types';

export const SCHEMA_VERSION = 1;

export interface State {
  questions: Question[];
  attempts: Attempt[];
  settings: Settings;
}
export interface Backup extends State {
  app: 'teoriq';
  schema: number;
  exportedAt: string;
}

export function buildBackup(state: State, now = Date.now()): Backup {
  return { app: 'teoriq', schema: SCHEMA_VERSION, exportedAt: new Date(now).toISOString(), ...state };
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strOrNull = (v: unknown): string | null => (isStr(v) ? v : null);
const idxOrNull = (v: unknown): number | null => (isNum(v) && Number.isInteger(v) && v >= 0 ? v : null);

const IMG_PREFIX = 'data:image/jpeg;base64,';
const imgOrNull = (v: unknown): string | null => (isStr(v) && v.startsWith(IMG_PREFIX) && v.length > IMG_PREFIX.length && v.length <= 150_000 ? v : null);

function sanitizeQuestion(q: any): Question | null {
  if (!q || !isStr(q.key) || !isStr(q.stem) || !Array.isArray(q.options) || !q.options.every(isStr)) return null;
  return {
    key: q.key, platform: isStr(q.platform) ? q.platform : 'aeolcloud', externalId: strOrNull(q.externalId),
    stem: q.stem, options: q.options, correctText: strOrNull(q.correctText),
    platformCategory: strOrNull(q.platformCategory), manualCategory: strOrNull(q.manualCategory), imageData: imgOrNull(q.imageData),
    firstSeen: isNum(q.firstSeen) ? q.firstSeen : 0, lastSeen: isNum(q.lastSeen) ? q.lastSeen : 0,
  };
}
function sanitizeAttempt(a: any): Attempt | null {
  if (!a || !isStr(a.id) || !isStr(a.questionKey) || !isNum(a.ts)) return null;
  if (!['correct', 'wrong', 'unknown'].includes(a.result)) return null;
  return {
    id: a.id, questionKey: a.questionKey, platform: isStr(a.platform) ? a.platform : 'aeolcloud', ts: a.ts,
    result: a.result, confidence: a.confidence === 'confirmed' ? 'confirmed' : 'review',
    source: ['platform', 'review', 'manual'].includes(a.source) ? a.source : 'platform',
    selectedIndex: idxOrNull(a.selectedIndex), correctIndex: idxOrNull(a.correctIndex),
    selectedText: strOrNull(a.selectedText), correctText: strOrNull(a.correctText),
    responseMs: isNum(a.responseMs) ? a.responseMs : null, reason: isStr(a.reason) ? a.reason : undefined,
  };
}

export type ParseResult = { ok: true; state: State; skipped: number } | { ok: false; error: string };

/** Valida y limpia una copia de seguridad. Nunca lanza: devuelve un error legible. */
export function parseBackup(text: string): ParseResult {
  let raw: any;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'El archivo no es un JSON válido.' }; }
  if (!raw || raw.app !== 'teoriq') return { ok: false, error: 'El archivo no es una copia de seguridad de TEORIQ.' };
  if (!isNum(raw.schema) || raw.schema > SCHEMA_VERSION) return { ok: false, error: 'La copia es de una versión más reciente de TEORIQ. Actualiza la extensión.' };
  if (!Array.isArray(raw.questions) || !Array.isArray(raw.attempts)) return { ok: false, error: 'La copia está incompleta (faltan preguntas o intentos).' };
  const questions = raw.questions.map(sanitizeQuestion).filter((x: Question | null): x is Question => !!x);
  const attempts = raw.attempts.map(sanitizeAttempt).filter((x: Attempt | null): x is Attempt => !!x);
  const skipped = raw.questions.length - questions.length + (raw.attempts.length - attempts.length);
  const s = raw.settings ?? {};
  const settings: Settings = {
    examDate: isStr(s.examDate) && /^\d{4}-\d{2}-\d{2}$/.test(s.examDate) ? s.examDate : null,
    minutesPerDay: isNum(s.minutesPerDay) && s.minutesPerDay > 0 ? s.minutesPerDay : DEFAULT_SETTINGS.minutesPerDay,
    questionsPerDay: isNum(s.questionsPerDay) && s.questionsPerDay > 0 ? s.questionsPerDay : DEFAULT_SETTINGS.questionsPerDay,
    showToast: typeof s.showToast === 'boolean' ? s.showToast : DEFAULT_SETTINGS.showToast,
  };
  return { ok: true, state: { questions, attempts, settings }, skipped };
}

/** Fusiona `incoming` en `base`: une por id/clave, sin duplicar y respetando las categorías manuales. */
export function mergeStates(base: State, incoming: State): State {
  const qs = new Map(base.questions.map((q) => [q.key, q]));
  for (const q of incoming.questions) {
    const cur = qs.get(q.key);
    if (!cur) { qs.set(q.key, q); continue; }
    qs.set(q.key, {
      ...cur,
      options: q.lastSeen > cur.lastSeen ? q.options : cur.options,
      correctText: cur.correctText ?? q.correctText,
      manualCategory: cur.manualCategory ?? q.manualCategory,
      imageData: cur.imageData ?? q.imageData ?? null,
      platformCategory: cur.platformCategory ?? q.platformCategory,
      firstSeen: Math.min(cur.firstSeen || q.firstSeen, q.firstSeen || cur.firstSeen),
      lastSeen: Math.max(cur.lastSeen, q.lastSeen),
    });
  }
  const as = new Map(base.attempts.map((a) => [a.id, a]));
  for (const a of incoming.attempts) if (!as.has(a.id)) as.set(a.id, a);
  return { questions: [...qs.values()], attempts: [...as.values()].sort((x, y) => x.ts - y.ts), settings: base.settings };
}
