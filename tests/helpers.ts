import { JSDOM } from 'jsdom';
import type { Attempt, CapturePayload, Question } from '../src/core/types';

export type IconState = 'show' | 'hide' | 'hide-parent' | 'hide-style' | 'absent';
export interface Opt { text: string; check?: IconState; times?: IconState }

function icon(cls: string, st: IconState = 'hide'): string {
  switch (st) {
    case 'show': return `<i class="fa ${cls}"></i>`;
    case 'hide': return `<i class="fa ${cls} ng-hide"></i>`;
    case 'hide-style': return `<i class="fa ${cls}" style="display:none"></i>`;
    case 'hide-parent': return `<span class="ng-hide"><i class="fa ${cls}"></i></span>`;
    default: return '';
  }
}

/** HTML de una pregunta con la MISMA estructura que AEOLCLOUD (.question > h2.configsize, .answer > .texto-respuesta, .fa-check/.fa-times).
 *  Por defecto los iconos van con ng-hide, como hace AngularJS cuando no aplican. */
export function questionHtml(stem: string, opts: Opt[]): string {
  const answers = opts.map((o) =>
    `<div class="answer">${icon('fa-check', o.check)}${icon('fa-times', o.times)}<span class="texto-respuesta">${o.text}</span></div>`).join('');
  return `<div class="question"><h2 class="configsize">${stem}</h2>${answers}</div>`;
}

/** <img> como la de AEOLCLOUD (class="imagewrapper", foto en data URI). `hidden` simula ng-hide. */
export function imageHtml(b64: string, opts: { hidden?: boolean; mime?: string } = {}): string {
  return `<img class="imagewrapper${opts.hidden ? ' ng-hide' : ''}" src="data:${opts.mime ?? 'image/png'};base64, ${b64}" alt="Red dot">`;
}

export function makeDom(body = '') {
  const dom = new JSDOM(
    `<!doctype html><html><head><style>.ng-hide{display:none!important}</style></head><body>${body}</body></html>`,
    { pretendToBeVisual: true },
  );
  return dom;
}

/** Planificador manual: los tests avanzan el tiempo a mano, sin esperas reales. */
export function manualClock() {
  let t = 1_700_000_000_000;
  const tasks: { at: number; fn: () => void; id: number; alive: boolean }[] = [];
  let id = 0;
  return {
    now: () => t,
    schedule(fn: () => void, ms: number) {
      const task = { at: t + ms, fn, id: ++id, alive: true };
      tasks.push(task);
      return () => { task.alive = false; };
    },
    advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const next = tasks.filter((x) => x.alive && x.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!next) break;
        t = next.at; next.alive = false; next.fn();
      }
      t = end;
    },
  };
}

export function mkQuestion(over: Partial<Question> = {}): Question {
  return {
    key: 'aeolcloud:q1', platform: 'aeolcloud', externalId: null, stem: '¿Qué indica la señal?',
    options: ['Prohibido girar', 'Ceda el paso', 'Stop'], correctText: 'Ceda el paso',
    platformCategory: null, manualCategory: null, firstSeen: 0, lastSeen: 0, ...over,
  };
}
let n = 0;
export function mkAttempt(over: Partial<Attempt> = {}): Attempt {
  n++;
  return {
    id: `a${n}`, questionKey: 'aeolcloud:q1', platform: 'aeolcloud', ts: 1_700_000_000_000 + n * 1000,
    result: 'correct', confidence: 'confirmed', source: 'platform', selectedIndex: 1, correctIndex: 1,
    selectedText: 'Ceda el paso', correctText: 'Ceda el paso', responseMs: null, ...over,
  };
}
export function mkPayload(over: Partial<CapturePayload> = {}): CapturePayload {
  return {
    platform: 'aeolcloud', key: 'aeolcloud:q1', externalId: null, platformCategory: null,
    stem: '¿Qué indica la señal?', options: ['Prohibido girar', 'Ceda el paso', 'Stop'],
    selectedIndex: 1, correctIndex: 1, result: 'correct', confidence: 'confirmed', ts: 1_700_000_000_000, responseMs: null, ...over,
  };
}
