// Content script: lee la plataforma (adaptador), detecta intentos (motor) y los envía al background.
// Nunca debe romper la página: todo está protegido con try/catch.
import { adapterForUrl } from './adapters';
import type { CapturePayload, Msg, Reply } from './core/types';
import { CaptureEngine } from './capture/engine';

const adapter = adapterForUrl(location.href);

function toast(text: string, kind: 'ok' | 'warn') {
  try {
    const host = document.createElement('div');
    host.setAttribute('data-teoriq-toast', '');
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      div{position:fixed;right:16px;bottom:16px;z-index:2147483647;font:600 13px/1.2 system-ui,sans-serif;
      padding:9px 13px;border-radius:10px;color:#fff;background:${kind === 'ok' ? '#0e6b5c' : '#9a5b00'};
      box-shadow:0 4px 14px rgba(0,0,0,.25);opacity:0;transition:opacity .2s;pointer-events:none}
      div.on{opacity:.96}</style><div>${text}</div>`;
    // Fuera de <body> para que el propio aviso no dispare el observador de mutaciones.
    document.documentElement.appendChild(host);
    const box = root.querySelector('div')!;
    requestAnimationFrame(() => box.classList.add('on'));
    setTimeout(() => { box.classList.remove('on'); setTimeout(() => host.remove(), 300); }, 2200);
  } catch { /* sin aviso, la captura sigue siendo válida */ }
}

/** Reduce la imagen de la pregunta a un JPEG pequeño (≈380 px) para no agotar el almacenamiento. Null si no se puede. */
async function shrink(src: string, maxW = 380, quality = 0.6): Promise<string | null> {
  try {
    const img = new Image();
    await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error('imagen no válida')); img.src = src; });
    if (!img.naturalWidth || !img.naturalHeight) return null;
    const k = Math.min(1, maxW / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch { return null; }
}

async function submit(p: CapturePayload): Promise<void> {
  // Un fallo con la imagen nunca debe impedir guardar el intento.
  const imageData = p.imageData ? await shrink(p.imageData) : null;
  await send({ ...p, imageData });
}

async function send(payload: CapturePayload, attempt = 0): Promise<void> {
  try {
    const msg: Msg = { type: 'teoriq:capture', payload };
    const r = (await chrome.runtime.sendMessage(msg)) as Reply | undefined;
    if (!r) throw new Error('sin respuesta');
    if (!r.ok) { console.debug('[TEORIQ] captura rechazada:', r.error); return; }
    const d = r.data as { status: string; confidence: string; result: string; showToast: boolean };
    if (d.showToast && d.status === 'saved') {
      if (d.confidence === 'confirmed') toast(d.result === 'correct' ? 'TEORIQ · acierto registrado' : 'TEORIQ · fallo registrado', 'ok');
      else toast('TEORIQ · captura pendiente de revisión', 'warn');
    }
  } catch (e) {
    // El service worker puede estar arrancando o la extensión recargada: un reintento corto.
    if (attempt < 2 && chrome.runtime?.id) setTimeout(() => void send(payload, attempt + 1), 1000 * (attempt + 1));
    else console.debug('[TEORIQ] no se pudo guardar la captura', e);
  }
}

if (adapter) {
  const engine = new CaptureEngine({ doc: document, adapter, onCapture: (p) => void submit(p) });
  const go = () => { try { engine.start(); } catch (e) { console.debug('[TEORIQ] no se pudo iniciar', e); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
  else go();
}
