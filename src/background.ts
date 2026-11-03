// Service worker: ÚNICO punto de escritura de datos (cola serializada en Repo). Abre el panel lateral.
import { adapterById, urlMatches } from './adapters';
import type { CapturePayload, Msg, Reply } from './core/types';
import { chromeKV } from './storage/kv';
import { Repo } from './storage/repo';

const repo = new Repo(chromeKV);

// Idempotente: se registra en cada arranque del service worker (no solo en onInstalled/onStartup).
const enablePanelOnActionClick = () => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
void enablePanelOnActionClick();
chrome.runtime.onInstalled.addListener(() => { void enablePanelOnActionClick(); void repo.init(); });
chrome.runtime.onStartup.addListener(() => { void enablePanelOnActionClick(); });

function validCapture(p: unknown, senderUrl: string | undefined): p is CapturePayload {
  const c = p as CapturePayload;
  if (!c || typeof c.key !== 'string' || typeof c.stem !== 'string' || !Array.isArray(c.options) || c.options.length < 2) return false;
  if (!c.options.every((o) => typeof o === 'string') || typeof c.ts !== 'number') return false;
  if (!['correct', 'wrong', 'unknown'].includes(c.result) || !['confirmed', 'review'].includes(c.confidence)) return false;
  for (const k of [c.selectedIndex, c.correctIndex]) if (k !== null && (!Number.isInteger(k) || k < 0 || k >= c.options.length)) return false;
  // Solo se aceptan capturas de páginas de una plataforma soportada.
  const adapter = adapterById(c.platform);
  return !!adapter && !!senderUrl && urlMatches(adapter, senderUrl);
}

async function handle(msg: Msg, sender: chrome.runtime.MessageSender): Promise<Reply> {
  switch (msg.type) {
    case 'teoriq:capture': {
      if (!validCapture(msg.payload, sender.url)) return { ok: false, error: 'Captura no válida' };
      const r = await repo.record(msg.payload);
      const settings = (await repo.load()).settings;
      return { ok: true, data: { status: r.status, confidence: r.attempt.confidence, result: r.attempt.result, showToast: settings.showToast } };
    }
    case 'teoriq:record-review': {
      const a = await repo.recordReview(msg.questionKey, msg.correct, msg.selectedText);
      return a ? { ok: true } : { ok: false, error: 'Pregunta sin respuesta correcta confirmada' };
    }
    case 'teoriq:resolve': return (await repo.resolve(msg.attemptId, msg.selectedIndex, msg.correctIndex)) ? { ok: true } : { ok: false, error: 'No se pudo resolver' };
    case 'teoriq:set-category': await repo.setCategory(msg.questionKey, msg.category); return { ok: true };
    case 'teoriq:delete-attempt': await repo.deleteAttempt(msg.attemptId); return { ok: true };
    case 'teoriq:set-settings': return { ok: true, data: await repo.setSettings(msg.settings) };
    case 'teoriq:import': {
      const r = await repo.importJson(msg.json, msg.mode);
      return r.ok ? { ok: true, data: r } : r;
    }
    case 'teoriq:export': return { ok: true, data: await repo.exportJson() };
    case 'teoriq:wipe': await repo.wipe(); return { ok: true };
    default: return { ok: false, error: 'Mensaje desconocido' };
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  handle(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
  return true; // respuesta asíncrona
});
