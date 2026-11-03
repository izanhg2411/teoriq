// Repositorio: toda la lógica de guardado sobre un KV. Las escrituras se serializan (cola) para evitar
// carreras de lectura-modificación-escritura cuando llegan varias capturas seguidas al service worker.
import {
  DEFAULT_SETTINGS, type Attempt, type CapturePayload, type Question, type Settings,
} from '../core/types';
import { hash } from '../core/text';
import { buildBackup, mergeStates, parseBackup, SCHEMA_VERSION, type State } from './backup';
import type { KV } from './kv';

const P = { att: 'att:', q: 'q:', settings: 'settings', meta: 'meta' } as const;
/** Ventana en la que dos capturas idénticas de la misma pregunta se consideran un duplicado. */
export const DUPLICATE_WINDOW_MS = 5_000;

/** Solo se guardan imágenes JPEG reducidas (las genera el content script). */
const IMG_PREFIX = 'data:image/jpeg;base64,';
export const IMG_MAX_CHARS = 150_000; // por imagen
export const IMG_BUDGET_CHARS = 6_500_000; // total de imágenes (chrome.storage.local ≈ 10 MB, sin pedir unlimitedStorage)
const validImage = (v: unknown): string | null =>
  typeof v === 'string' && v.startsWith(IMG_PREFIX) && v.length > IMG_PREFIX.length && v.length <= IMG_MAX_CHARS ? v : null;

export type RecordResult = { status: 'saved' | 'duplicate'; attempt: Attempt };

export class Repo {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private kv: KV, private now: () => number = Date.now) {}

  /** Ejecuta `fn` en exclusión mutua respecto a otras escrituras. */
  private tx<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async load(): Promise<State> {
    const all = await this.kv.getAll();
    const questions: Question[] = [];
    const attempts: Attempt[] = [];
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith(P.q)) questions.push(v as Question);
      else if (k.startsWith(P.att)) attempts.push(v as Attempt);
    }
    attempts.sort((a, b) => a.ts - b.ts);
    return { questions, attempts, settings: { ...DEFAULT_SETTINGS, ...((all[P.settings] as Partial<Settings>) ?? {}) } };
  }

  /** Ejecutar al arrancar: fija la versión del esquema y es el sitio donde irían las migraciones. */
  init(): Promise<void> {
    return this.tx(async () => {
      const meta = ((await this.kv.getAll())[P.meta] as { schema?: number } | undefined) ?? {};
      if ((meta.schema ?? 0) < SCHEMA_VERSION) await this.kv.set({ [P.meta]: { schema: SCHEMA_VERSION } });
    });
  }

  record(p: CapturePayload): Promise<RecordResult> {
    return this.tx(async () => {
      const all = await this.kv.getAll();
      const selectedText = p.selectedIndex !== null ? p.options[p.selectedIndex] ?? null : null;
      const correctText = p.correctIndex !== null ? p.options[p.correctIndex] ?? null : null;

      // Duplicado: misma pregunta y mismo resultado casi al mismo tiempo (re-render de Angular, doble envío).
      for (const [k, v] of Object.entries(all)) {
        if (!k.startsWith(P.att)) continue;
        const a = v as Attempt;
        if (a.questionKey === p.key && a.source === 'platform' && Math.abs(a.ts - p.ts) < DUPLICATE_WINDOW_MS
          && a.selectedText === selectedText && a.correctText === correctText) {
          return { status: 'duplicate', attempt: a };
        }
      }

      const prev = all[P.q + p.key] as Question | undefined;
      // Imagen: la primera válida gana (no se sobrescribe) y solo si queda presupuesto de espacio.
      let imageData: string | null = prev?.imageData ?? null;
      if (!imageData) {
        const img = validImage(p.imageData);
        const used = Object.entries(all).reduce((n, [k, v]) => (k.startsWith(P.q) ? n + ((v as Question).imageData?.length ?? 0) : n), 0);
        if (img && used + img.length <= IMG_BUDGET_CHARS) imageData = img;
      }
      const confirmedCorrect = p.confidence === 'confirmed' ? correctText : null;
      const q: Question = {
        key: p.key, platform: p.platform, externalId: p.externalId ?? prev?.externalId ?? null,
        stem: p.stem, options: p.options,
        correctText: confirmedCorrect ?? prev?.correctText ?? null,
        platformCategory: p.platformCategory ?? prev?.platformCategory ?? null,
        manualCategory: prev?.manualCategory ?? null, imageData,
        firstSeen: prev?.firstSeen ?? p.ts, lastSeen: p.ts,
      };
      const attempt: Attempt = {
        id: `${p.ts.toString(36)}-${hash(p.key + p.ts)}`,
        questionKey: p.key, platform: p.platform, ts: p.ts, result: p.result, confidence: p.confidence,
        source: 'platform', selectedIndex: p.selectedIndex, correctIndex: p.correctIndex,
        selectedText, correctText, responseMs: p.responseMs, reason: p.reason,
      };
      await this.kv.set({ [P.q + q.key]: q, [P.att + attempt.id]: attempt });
      return { status: 'saved', attempt };
    });
  }

  /** Intento hecho en el modo de repaso de TEORIQ (usa la respuesta correcta ya confirmada). */
  recordReview(questionKey: string, correct: boolean, selectedText: string | null): Promise<Attempt | null> {
    return this.tx(async () => {
      const q = (await this.kv.getAll())[P.q + questionKey] as Question | undefined;
      if (!q?.correctText) return null; // sin respuesta correcta confirmada no se puede corregir un repaso
      const ts = this.now();
      const attempt: Attempt = {
        id: `${ts.toString(36)}-${hash(questionKey + ts + 'r')}`, questionKey, platform: q.platform, ts,
        result: correct ? 'correct' : 'wrong', confidence: 'confirmed', source: 'review',
        selectedIndex: selectedText ? q.options.indexOf(selectedText) : null,
        correctIndex: q.options.indexOf(q.correctText), selectedText, correctText: q.correctText, responseMs: null,
      };
      await this.kv.set({ [P.att + attempt.id]: attempt });
      return attempt;
    });
  }

  /** El usuario indica a mano cuál eligió y cuál era la correcta en una captura pendiente de revisión. */
  resolve(attemptId: string, selectedIndex: number, correctIndex: number): Promise<boolean> {
    return this.tx(async () => {
      const all = await this.kv.getAll();
      const a = all[P.att + attemptId] as Attempt | undefined;
      const q = a ? (all[P.q + a.questionKey] as Question | undefined) : undefined;
      if (!a || !q || !q.options[selectedIndex] || !q.options[correctIndex]) return false;
      const upd: Attempt = {
        ...a, selectedIndex, correctIndex, selectedText: q.options[selectedIndex]!, correctText: q.options[correctIndex]!,
        result: selectedIndex === correctIndex ? 'correct' : 'wrong', confidence: 'confirmed', source: 'manual', reason: undefined,
      };
      await this.kv.set({ [P.att + a.id]: upd, [P.q + q.key]: { ...q, correctText: q.options[correctIndex]! } });
      return true;
    });
  }

  setCategory(questionKey: string, category: string | null): Promise<void> {
    return this.tx(async () => {
      const q = (await this.kv.getAll())[P.q + questionKey] as Question | undefined;
      if (q) await this.kv.set({ [P.q + questionKey]: { ...q, manualCategory: category } });
    });
  }

  deleteAttempt(id: string): Promise<void> {
    return this.tx(() => this.kv.remove([P.att + id]));
  }

  setSettings(patch: Partial<Settings>): Promise<Settings> {
    return this.tx(async () => {
      const cur = { ...DEFAULT_SETTINGS, ...(((await this.kv.getAll())[P.settings] as Partial<Settings>) ?? {}) };
      const next = { ...cur, ...patch };
      await this.kv.set({ [P.settings]: next });
      return next;
    });
  }

  async exportJson(): Promise<string> {
    return JSON.stringify(buildBackup(await this.load(), this.now()), null, 2);
  }

  importJson(text: string, mode: 'merge' | 'replace'): Promise<{ ok: true; questions: number; attempts: number; skipped: number } | { ok: false; error: string }> {
    return this.tx(async () => {
      const parsed = parseBackup(text);
      if (!parsed.ok) return parsed;
      const all = await this.kv.getAll();
      const cur: State = await this.loadFrom(all);
      const next = mode === 'replace' ? parsed.state : mergeStates(cur, parsed.state);
      // Al fusionar se conservan los ajustes actuales, salvo que aún no existan: entonces se toman de la copia.
      if (mode === 'merge' && all[P.settings] === undefined) next.settings = parsed.state.settings;
      if (mode === 'replace') await this.kv.remove(Object.keys(all).filter((k) => k.startsWith(P.q) || k.startsWith(P.att)));
      const items: Record<string, unknown> = { [P.settings]: next.settings, [P.meta]: { schema: SCHEMA_VERSION } };
      for (const q of next.questions) items[P.q + q.key] = q;
      for (const a of next.attempts) items[P.att + a.id] = a;
      await this.kv.set(items);
      return { ok: true, questions: next.questions.length, attempts: next.attempts.length, skipped: parsed.skipped };
    });
  }

  wipe(): Promise<void> {
    return this.tx(async () => {
      const all = await this.kv.getAll();
      await this.kv.remove(Object.keys(all).filter((k) => k.startsWith(P.q) || k.startsWith(P.att) || k === P.settings));
    });
  }

  private async loadFrom(all: Record<string, unknown>): Promise<State> {
    const questions: Question[] = [];
    const attempts: Attempt[] = [];
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith(P.q)) questions.push(v as Question);
      else if (k.startsWith(P.att)) attempts.push(v as Attempt);
    }
    return { questions, attempts, settings: { ...DEFAULT_SETTINGS, ...((all[P.settings] as Partial<Settings>) ?? {}) } };
  }
}

/** Para que el panel sepa qué claves cambian. */
export const isDataKey = (k: string) => k.startsWith(P.att) || k.startsWith(P.q) || k === P.settings;
