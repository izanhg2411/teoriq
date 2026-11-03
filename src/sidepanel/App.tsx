import { useEffect, useState } from 'react';
import { useData } from './data';
import { Captures, DataView, PlanView, Review, Stats, Today } from './views';

const TABS = [
  ['today', 'Hoy'], ['stats', 'Estadísticas'], ['review', 'Repaso'], ['plan', 'Plan'], ['captures', 'Capturas'], ['data', 'Datos'],
] as const;

export function App() {
  const { data, ready, now } = useData();
  const [tab, setTab] = useState<string>(() => { try { return sessionStorage.getItem('teoriq.tab') ?? 'today'; } catch { return 'today'; } });
  useEffect(() => { try { sessionStorage.setItem('teoriq.tab', tab); } catch { /* sin almacenamiento de sesión */ } }, [tab]);
  const props = { data, now, go: setTab };
  const pending = data.attempts.filter((a) => a.confidence === 'review').length;
  return (
    <div className="app">
      <header className="top">
        <img src="icons/icon32.png" alt="" width={24} height={24} />
        <h1>TEORIQ</h1>
        <span className="tag">AEOLCLOUD · Permiso B</span>
      </header>
      <nav className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}{id === 'captures' && pending > 0 && <span className="dot-n">{pending}</span>}
          </button>
        ))}
      </nav>
      <main>
        {!ready ? <p className="empty">Cargando…</p> : (
          <>
            {tab === 'today' && <Today {...props} />}
            {tab === 'stats' && <Stats {...props} />}
            {tab === 'review' && <Review {...props} />}
            {tab === 'plan' && <PlanView {...props} />}
            {tab === 'captures' && <Captures {...props} />}
            {tab === 'data' && <DataView {...props} />}
          </>
        )}
      </main>
    </div>
  );
}
