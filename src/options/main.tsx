import { createRoot } from 'react-dom/client';
import { DataView, SettingsForm } from '../sidepanel/views';
import { Card } from '../sidepanel/ui';
import { useData } from '../sidepanel/data';

function Options() {
  const { data, ready, now } = useData();
  if (!ready) return <p className="empty">Cargando…</p>;
  return (
    <div className="app options">
      <header className="top"><img src="icons/icon32.png" alt="" width={24} height={24} /><h1>TEORIQ · Ajustes</h1></header>
      <main>
        <Card title="Plan de estudio"><SettingsForm settings={data.settings} /></Card>
        <DataView data={data} now={now} go={() => {}} />
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Options />);
