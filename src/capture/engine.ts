// Motor de captura: observa el DOM, espera a que la corrección se estabilice y emite UNA captura por intento.
// Independiente de la plataforma (usa un PlatformAdapter) y del entorno (timers y reloj inyectables para tests).
import type { PlatformAdapter } from '../adapters/types';
import type { CapturePayload, Evaluation } from '../core/types';
import { questionKey } from '../core/text';
import { evaluate } from './evaluate';

export type Cancel = () => void;
export interface EngineOptions {
  doc: Document;
  adapter: PlatformAdapter;
  onCapture: (p: CapturePayload) => void;
  now?: () => number;
  /** Tiempo que la corrección debe permanecer estable antes de guardarla. */
  settleMs?: number;
  /** Agrupa ráfagas de mutaciones de Angular en un solo escaneo. */
  debounceMs?: number;
  schedule?: (fn: () => void, ms: number) => Cancel;
}

interface State {
  key: string;
  armed: boolean; // hemos visto la pregunta SIN corrección: sabemos que se contesta ante nosotros
  committed: boolean;
  startedAt: number | null;
  timeReliable: boolean;
  hidden: boolean; // la pestaña estuvo oculta mientras se contestaba
  sig: string | null;
  firstCorrectionAt: number | null;
  cancel: Cancel | null;
  /** Última lectura con corrección visible (para guardar el intento si el usuario cambia de pregunta antes de que termine la espera). */
  lastSnap: NonNullable<ReturnType<PlatformAdapter['read']>> | null;
  lastEv: Evaluation | null;
  /** Última imagen vista antes de aparecer la corrección (para no adjuntar la imagen de la pregunta anterior). */
  armImg: string | null;
}

const defaultSchedule = (fn: () => void, ms: number): Cancel => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

export class CaptureEngine {
  /** Estado por PREGUNTA (no por nodo): Angular puede recrear el elemento sin que el intento cambie. */
  private states = new Map<string, State>();
  private mo: MutationObserver | null = null;
  private debounceCancel: Cancel | null = null;
  private initialScanDone = false;
  private readonly now: () => number;
  private readonly settleMs: number;
  private readonly debounceMs: number;
  private readonly schedule: (fn: () => void, ms: number) => Cancel;
  private readonly onVis = () => {
    if (this.opts.doc.visibilityState === 'hidden') for (const s of this.states.values()) s.hidden = true;
  };

  constructor(private opts: EngineOptions) {
    this.now = opts.now ?? Date.now;
    this.settleMs = opts.settleMs ?? 500;
    this.debounceMs = opts.debounceMs ?? 100;
    this.schedule = opts.schedule ?? defaultSchedule;
  }

  start(): void {
    const win = this.opts.doc.defaultView;
    const MO = win?.MutationObserver;
    if (!MO || this.mo) return;
    this.mo = new MO(() => this.queueScan());
    // Observa documentElement (no solo body) para cubrir cualquier re-render de Angular.
    this.mo.observe(this.opts.doc.documentElement, {
      childList: true, subtree: true, attributes: true, characterData: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
    this.opts.doc.addEventListener('visibilitychange', this.onVis);
    this.scan();
    this.initialScanDone = true;
  }

  stop(): void {
    this.mo?.disconnect();
    this.mo = null;
    this.opts.doc.removeEventListener('visibilitychange', this.onVis);
    this.debounceCancel?.();
    for (const s of this.states.values()) s.cancel?.();
    this.states.clear();
  }

  private queueScan(): void {
    this.debounceCancel?.();
    this.debounceCancel = this.schedule(() => this.scan(), this.debounceMs);
  }

  /** Escanea ahora mismo todas las preguntas presentes. Pública para tests. */
  scan(): void {
    const seen = new Set<string>();
    for (const el of this.opts.adapter.questionElements(this.opts.doc)) {
      try {
        const key = this.process(el);
        if (key) seen.add(key);
      } catch (e) { console.debug('[TEORIQ] error al leer la pregunta', e); }
    }
    // Una pregunta que desaparece de la pantalla olvida su estado: si vuelve ya corregida, no la vimos contestar.
    for (const [key, st] of Array.from(this.states)) {
      if (!seen.has(key)) { st.cancel?.(); this.flushOnLeave(st); this.states.delete(key); }
    }
  }

  private process(el: Element): string | null {
    const snap = this.opts.adapter.read(el);
    if (!snap) return null;
    const platform = this.opts.adapter.id;
    const key = questionKey(platform, snap.stem, snap.options.map((o) => o.text));
    const ev = evaluate(snap);

    let st = this.states.get(key);
    if (!st) {
      st = { key, armed: false, committed: false, startedAt: null, timeReliable: false, hidden: false, sig: null, firstCorrectionAt: null, cancel: null, lastSnap: null, lastEv: null, armImg: null };
      this.states.set(key, st);
    }

    if (ev.state === 'no-correction') {
      st.cancel?.(); st.cancel = null; st.sig = null; st.firstCorrectionAt = null;
      st.armImg = snap.imageSrc; // se actualiza en cada lectura previa a la corrección
      if (!st.armed || st.committed) {
        // Pregunta nueva (o la misma contestada otra vez): empieza un intento.
        st.armed = true; st.committed = false;
        st.startedAt = this.now();
        st.timeReliable = this.initialScanDone; // en la carga inicial no sabemos cuánto llevaba en pantalla
        st.hidden = this.opts.doc.visibilityState === 'hidden';
      }
      return key;
    }

    if (!st.armed || st.committed) return key; // ya corregida al aparecer (p. ej. repaso de resultados) o ya guardada

    st.lastSnap = snap; st.lastEv = ev;
    const sig = `${ev.state}:${ev.selectedIndex}:${ev.correctIndex}`;
    if (st.sig === sig && st.cancel) return key; // ya esperando a que se estabilice
    st.cancel?.();
    if (st.sig !== sig) st.firstCorrectionAt = this.now();
    st.sig = sig;
    st.cancel = this.schedule(() => this.commit(key, sig), this.settleMs);
    return key;
  }

  private commit(key: string, sig: string): void {
    const st = this.states.get(key);
    if (!st || st.committed || st.sig !== sig) return;
    st.cancel = null;
    // Relee la pregunta actual (el nodo pudo recrearse) y confirma que sigue igual que cuando empezamos a esperar.
    const platform = this.opts.adapter.id;
    let snap = null as ReturnType<PlatformAdapter['read']>;
    for (const el of this.opts.adapter.questionElements(this.opts.doc)) {
      const s = this.opts.adapter.read(el);
      if (s && questionKey(platform, s.stem, s.options.map((o) => o.text)) === key) { snap = s; break; }
    }
    if (!snap) return;
    const options = snap.options.map((o) => o.text);
    const ev = evaluate(snap);
    const nowSig = `${ev.state}:${ev.selectedIndex}:${ev.correctIndex}`;
    if (nowSig !== sig) { this.scan(); return; } // cambió mientras esperábamos
    if (ev.state === 'no-correction') return;

    st.committed = true;
    this.emit(st, snap, ev);
  }

  /** La pregunta desapareció (el usuario pasó a la siguiente) antes de acabar la espera de estabilidad.
   *  Se guarda lo último que se leyó con la corrección visible, para no perder aciertos contestados rápido.
   *  Una lectura dudosa sigue guardándose como «pendiente de revisión». */
  private flushOnLeave(st: State): void {
    if (!st.armed || st.committed || !st.sig || !st.lastSnap || !st.lastEv) return;
    if (st.lastEv.state === 'no-correction') return;
    st.committed = true;
    this.emit(st, st.lastSnap, st.lastEv);
  }

  private emit(st: State, snap: NonNullable<ReturnType<PlatformAdapter['read']>>, ev: Evaluation): void {
    const at = this.now();
    let responseMs: number | null = null;
    if (st.startedAt !== null && st.firstCorrectionAt !== null && st.timeReliable && !st.hidden) {
      const ms = st.firstCorrectionAt - st.startedAt;
      if (ms >= 300 && ms <= 10 * 60_000) responseMs = ms;
    }
    this.opts.onCapture({
      platform: this.opts.adapter.id, key: st.key,
      // Solo si la imagen no cambió entre que se vio la pregunta sin corregir y la corrección (o aún no se había pintado).
      imageData: snap.imageSrc && (st.armImg === null || st.armImg === snap.imageSrc) ? snap.imageSrc : null,
      externalId: snap.externalId,
      platformCategory: snap.platformCategory,
      stem: snap.stem,
      options: snap.options.map((o) => o.text),
      selectedIndex: ev.selectedIndex,
      correctIndex: ev.correctIndex,
      result: ev.state === 'correct' ? 'correct' : ev.state === 'wrong' ? 'wrong' : ev.selectedIndex !== null ? 'wrong' : 'unknown',
      confidence: ev.state === 'review' ? 'review' : 'confirmed',
      reason: ev.reason,
      ts: at,
      responseMs,
    });
  }
}
