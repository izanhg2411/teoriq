import type { PlatformAdapter } from './types';
import { aeolcloud } from './aeolcloud';

export const ADAPTERS: PlatformAdapter[] = [aeolcloud];
export const adapterById = (id: string) => ADAPTERS.find((a) => a.id === id);

/** ¿Encaja la URL con algún match pattern del adaptador? (el puerto se ignora, como en Chrome) */
export function urlMatches(adapter: PlatformAdapter, url: string): boolean {
  return adapter.matches.some((m) => {
    const mm = /^(https?):\/\/([^/]+)(\/.*)$/.exec(m);
    if (!mm) return false;
    const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${mm[1]}://${esc(mm[2]!)}(:\\d+)?${esc(mm[3]!)}$`).test(url);
  });
}
export const adapterForUrl = (url: string) => ADAPTERS.find((a) => urlMatches(a, url));
