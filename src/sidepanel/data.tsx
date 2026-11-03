// Acceso a datos desde el panel: lectura directa de chrome.storage.local (solo lectura) y escrituras vía background.
import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type Msg, type Reply } from '../core/types';
import { chromeKV } from '../storage/kv';
import { Repo, isDataKey } from '../storage/repo';
import type { State } from '../storage/backup';

const repo = new Repo(chromeKV);
const EMPTY: State = { questions: [], attempts: [], settings: DEFAULT_SETTINGS };

export async function send(msg: Msg): Promise<Reply> {
  try {
    return ((await chrome.runtime.sendMessage(msg)) as Reply | undefined) ?? { ok: false, error: 'Sin respuesta del servicio de TEORIQ' };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/** Datos en vivo: se recargan cuando cambia el almacenamiento (p. ej. al registrarse una captura en otra pestaña). */
export function useData(): { data: State; ready: boolean; now: number } {
  const [data, setData] = useState<State>(EMPTY);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => { const d = await repo.load(); if (alive) { setData(d); setNow(Date.now()); setReady(true); } };
    void load();
    const onChange = (changes: Record<string, unknown>) => {
      if (!Object.keys(changes).some(isDataKey)) return;
      clearTimeout(timer);
      timer = setTimeout(load, 120); // agrupa ráfagas de cambios
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => { alive = false; clearTimeout(timer); chrome.storage.onChanged.removeListener(onChange); };
  }, []);
  return { data, ready, now };
}
