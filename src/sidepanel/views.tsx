import { useMemo, useRef, useState } from 'react';
import { CATEGORIES, UNCLASSIFIED, topicOf } from '../analytics/categories';
import { computeStats, trend } from '../analytics/stats';
import { MIN_ATTEMPTS_GLOBAL, MIN_ATTEMPTS_TOPIC, type Attempt, type Question, type Settings } from '../core/types';
import { buildPlan } from '../study-plan/plan';
import type { State } from '../storage/backup';
import { send } from './data';
import { Bar, Card, Empty, EvolutionChart, Notice, fmtDate, fmtDay, pct } from './ui';

type Go = (tab: string) => void;
interface P { data: State; now: number; go: Go }

/* ───────────── HOY ───────────── */
export function Today({ data, now, go }: P) {
  const stats = useMemo(() => computeStats(data.questions, data.attempts), [data]);
  const plan = useMemo(() => buildPlan(data.questions, data.attempts, data.settings, now), [data, now]);
  const tr = useMemo(() => trend(data.attempts, now), [data, now]);

  if (!data.attempts.length) {
    return (
      <Card title="Bienvenido a TEORIQ">
        <p>Entra en <strong>cloud.aeolservice.es</strong> y haz un test con normalidad. TEORIQ registrará cada pregunta contestada en cuanto la plataforma muestre la corrección.</p>
        <p className="muted">Todo se guarda solo en este navegador. No hace falta enviar capturas ni copiar nada.</p>
      </Card>
    );
  }
  const delta = tr.recent !== null && tr.previous !== null && tr.recentN >= 10 && tr.previousN >= 10 ? tr.recent - tr.previous : null;
  return (
    <>
      <Card title="Cómo vas">
        <div className="hero">
          <div className="hero-n"><span className="big">{pct(stats.accuracy)}</span><span className="muted">de aciertos</span></div>
          <dl className="kv">
            <div><dt>Contestadas</dt><dd>{stats.total}</dd></div>
            <div><dt>Aciertos</dt><dd className="good">{stats.correct}</dd></div>
            <div><dt>Errores</dt><dd className="bad">{stats.wrong}</dd></div>
          </dl>
        </div>
        {!stats.enoughData && <Notice>Aún hay pocos datos ({stats.total} de {MIN_ATTEMPTS_GLOBAL}). Las cifras son orientativas y todavía no sirven para sacar conclusiones.</Notice>}
        {delta !== null && <p className="muted">Últimos 7 días: {pct(tr.recent)} ({delta >= 0 ? '+' : ''}{Math.round(delta * 100)} puntos frente a la semana anterior).</p>}
        {stats.pendingReview > 0 && <Notice kind="warn">{stats.pendingReview} captura{stats.pendingReview > 1 ? 's' : ''} pendiente{stats.pendingReview > 1 ? 's' : ''} de revisión (no cuentan en las estadísticas). <button className="link" onClick={() => go('captures')}>Revisar</button></Notice>}
      </Card>

      <Card title="Dónde fallas">
        {stats.weakTopics.length ? (
          <ul className="rows">
            {stats.weakTopics.slice(0, 3).map((t) => (
              <li key={t.topic}><div className="row-top"><span>{t.topic}</span><strong>{pct(t.errorRate)} de fallos</strong></div><Bar value={t.errorRate} /><span className="muted small">{t.wrong} de {t.answered} preguntas</span></li>
            ))}
          </ul>
        ) : <Empty>Cuando tengas al menos {MIN_ATTEMPTS_TOPIC} preguntas de un mismo tema aparecerá aquí si es un punto débil.</Empty>}
        {stats.weakTopics.length > 0 && <p className="muted small">Los temas se asignan con reglas locales por palabras clave; puedes corregirlos en «Capturas».</p>}
      </Card>

      <Card title="Qué estudiar hoy">
        {plan.dueToday > 0 ? (
          <>
            <p><strong>{Math.min(plan.dueToday, plan.budget)}</strong> preguntas{plan.dueToday > plan.budget ? ` (de ${plan.dueToday} pendientes)` : ''} · unos {Math.max(1, Math.round((Math.min(plan.dueToday, plan.budget) * plan.secondsPerQuestion) / 60))} min</p>
            {plan.topicFocus.length > 0 && <p className="muted">Prioriza: {plan.topicFocus.map((t) => t.topic).join(', ')}.</p>}
            <button className="btn primary" onClick={() => go('review')}>Empezar repaso</button>
          </>
        ) : <Empty>No tienes repasos pendientes ahora mismo. Sigue haciendo tests y TEORIQ programará los repasos de lo que falles.</Empty>}
      </Card>

      {stats.recentWrong.length > 0 && (
        <Card title="Falladas recientemente">
          <ul className="list">
            {stats.recentWrong.slice(0, 5).map(({ attempt, question }) => (
              <li key={attempt.id}><span className="stem">{question?.stem ?? '(pregunta eliminada)'}</span><span className="muted small">{fmtDate(attempt.ts)}</span></li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

/* ───────────── ESTADÍSTICAS ───────────── */
export function Stats({ data }: P) {
  const s = useMemo(() => computeStats(data.questions, data.attempts), [data]);
  if (!s.total) return <Card title="Estadísticas"><Empty>Todavía no hay resultados confirmados.</Empty></Card>;
  return (
    <>
      {!s.enoughData && <Notice>Datos insuficientes ({s.total} de {MIN_ATTEMPTS_GLOBAL}): no saques conclusiones todavía.</Notice>}
      <Card title="Evolución"><EvolutionChart points={s.evolution} /></Card>
      <Card title="Temas">
        <ul className="rows">
          {s.topics.map((t) => (
            <li key={t.topic}>
              <div className="row-top"><span>{t.topic}</span><strong>{pct(t.errorRate)}</strong></div>
              <Bar value={t.errorRate} tone={t.errorRate > 0.35 ? 'bad' : t.errorRate > 0.15 ? 'mid' : 'good'} />
              <span className="muted small">{t.wrong} fallos de {t.answered}{!t.enoughData && ' · pocos datos, no fiable'}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">Porcentaje de fallos por tema (clasificación local, no oficial).</p>
      </Card>
      <Card title="Preguntas que fallas varias veces">
        {s.repeatedErrors.length ? (
          <ul className="list">
            {s.repeatedErrors.slice(0, 15).map((r) => (
              <li key={r.questionKey}><span className="stem">{r.stem}</span><span className="pill bad">{r.wrongCount}× fallada</span></li>
            ))}
          </ul>
        ) : <Empty>Ninguna pregunta fallada 2 o más veces. ¡Bien!</Empty>}
      </Card>
    </>
  );
}

/* ───────────── REPASO ───────────── */
/** Imagen de la pregunta guardada. Si el enunciado habla de una imagen y aún no hay ninguna, lo dice (sin inventar nada). */
const MENTIONS_IMAGE = /\b(imagen|figura|ilustraci[oó]n|foto|fotograf[ií]a)\b/i;
function QuestionImage({ q, compact }: { q: Question; compact?: boolean }) {
  if (q.imageData) return <img className={compact ? 'q-img small' : 'q-img'} src={q.imageData} alt="Imagen de la pregunta" />;
  if (!compact && MENTIONS_IMAGE.test(q.stem)) {
    return <p className="muted small img-missing">Esta pregunta menciona una imagen que TEORIQ aún no ha guardado. Vuelve a contestarla en AEOLCLOUD y se guardará.</p>;
  }
  return null;
}

export function Review({ data, now }: P) {
  const qmap = useMemo(() => new Map(data.questions.map((q) => [q.key, q])), [data.questions]);
  const [queue, setQueue] = useState<string[] | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState({ ok: 0, ko: 0 });
  const requeued = useRef(new Set<string>());

  const start = () => {
    const plan = buildPlan(data.questions, data.attempts, data.settings, now);
    setQueue(plan.today.map((p) => p.questionKey).filter((k) => qmap.get(k)?.correctText));
    setI(0); setPicked(null); setDone({ ok: 0, ko: 0 }); requeued.current = new Set();
  };

  if (!queue) {
    const plan = buildPlan(data.questions, data.attempts, data.settings, now);
    return (
      <Card title="Modo de repaso">
        <p>Repetición espaciada: lo que fallas vuelve pronto; lo que aciertas varias veces se espacia más.</p>
        {plan.today.length ? <button className="btn primary" onClick={start}>Repasar {plan.today.length} pregunta{plan.today.length > 1 ? 's' : ''}</button> : <Empty>No hay nada que repasar ahora. Vuelve más tarde o haz más tests.</Empty>}
        <p className="muted small">Solo se repasan preguntas de las que TEORIQ conoce la respuesta correcta confirmada. Si una pregunta lleva imagen, todavía no se guarda la imagen (limitación conocida).</p>
      </Card>
    );
  }
  const key = queue[i];
  const q = key ? qmap.get(key) : undefined;
  if (!q) {
    return (
      <Card title="Repaso terminado">
        <p><strong className="good">{done.ok} aciertos</strong> · <strong className="bad">{done.ko} fallos</strong></p>
        <button className="btn" onClick={() => setQueue(null)}>Volver</button>
      </Card>
    );
  }
  const answered = picked !== null;
  const choose = async (opt: string) => {
    if (answered) return;
    setPicked(opt);
    const ok = opt === q.correctText;
    setDone((d) => ({ ok: d.ok + (ok ? 1 : 0), ko: d.ko + (ok ? 0 : 1) }));
    await send({ type: 'teoriq:record-review', questionKey: q.key, correct: ok, selectedText: opt });
    // Un fallo vuelve a aparecer al final de esta misma sesión (una sola vez).
    if (!ok && !requeued.current.has(q.key)) { requeued.current.add(q.key); setQueue((cur) => (cur ? [...cur, q.key] : cur)); }
  };
  return (
    <Card title={`Pregunta ${i + 1} de ${queue.length}`} aside={<span className="pill">{topicOf(q).topic}</span>}>
      <p className="question-stem">{q.stem}</p>
      <QuestionImage q={q} />
      <ul className="options">
        {q.options.map((o) => {
          const state = !answered ? '' : o === q.correctText ? 'right' : o === picked ? 'wrong' : 'dim';
          return <li key={o}><button className={`opt ${state}`} onClick={() => choose(o)} disabled={answered}>{o}</button></li>;
        })}
      </ul>
      {answered && (
        <div className="after">
          <p className={picked === q.correctText ? 'good' : 'bad'}><strong>{picked === q.correctText ? '¡Correcto!' : 'Incorrecto.'}</strong>{picked !== q.correctText && <> La correcta es: <em>{q.correctText}</em></>}</p>
          <button className="btn primary" onClick={() => { setI(i + 1); setPicked(null); }}>Siguiente</button>
        </div>
      )}
    </Card>
  );
}

/* ───────────── PLAN ───────────── */
export function PlanView({ data, now }: P) {
  const plan = useMemo(() => buildPlan(data.questions, data.attempts, data.settings, now), [data, now]);
  return (
    <>
      <Card title="Mi plan"><SettingsForm settings={data.settings} /></Card>
      {plan.warnings.map((w) => <Notice key={w} kind="warn">{w}</Notice>)}
      <Card title="Hoy" aside={<span className="muted small">{plan.today.length} de {plan.budget} posibles</span>}>
        {plan.daysToExam !== null && plan.daysToExam >= 0 && <p className="muted">Faltan {plan.daysToExam} día{plan.daysToExam === 1 ? '' : 's'} para el examen.</p>}
        {plan.today.length ? (
          <ol className="list numbered">
            {plan.today.map((it) => (
              <li key={it.questionKey}><span className="stem">{it.stem}</span><span className="muted small">{it.topic} · {it.reasons.join(' · ')}</span></li>
            ))}
          </ol>
        ) : <Empty>Nada que repasar hoy.</Empty>}
      </Card>
      <Card title="Próximos días">
        <div className="forecast">
          {plan.forecast.map((f) => (
            <div key={f.date} className="fday"><span className="fn">{f.due}</span><span className="muted small">{fmtDay(f.date)}</span></div>
          ))}
        </div>
        <p className="muted small">Preguntas que vencerán cada día con tu historial actual (aumentarán si sigues fallando).</p>
      </Card>
    </>
  );
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const upd = (patch: Partial<Settings>) => void send({ type: 'teoriq:set-settings', settings: patch });
  return (
    <form className="form" onSubmit={(e) => e.preventDefault()}>
      <label>Fecha prevista del examen
        <input type="date" value={settings.examDate ?? ''} onChange={(e) => upd({ examDate: e.target.value || null })} />
      </label>
      <label>Tiempo disponible al día (min)
        <input type="number" min={5} max={600} value={settings.minutesPerDay} onChange={(e) => { const v = Number(e.target.value); if (v > 0) upd({ minutesPerDay: v }); }} />
      </label>
      <label>Preguntas a repasar al día (aprox.)
        <input type="number" min={1} max={500} value={settings.questionsPerDay} onChange={(e) => { const v = Number(e.target.value); if (v > 0) upd({ questionsPerDay: v }); }} />
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.showToast} onChange={(e) => upd({ showToast: e.target.checked })} />
        Mostrar un aviso discreto en la plataforma cuando se registra una pregunta
      </label>
    </form>
  );
}

/* ───────────── CAPTURAS ───────────── */
export function Captures({ data }: P) {
  const qmap = useMemo(() => new Map(data.questions.map((q) => [q.key, q])), [data.questions]);
  const [onlyReview, setOnlyReview] = useState(false);
  const list = useMemo(() => {
    const all = [...data.attempts].reverse();
    return (onlyReview ? all.filter((a) => a.confidence === 'review') : all).slice(0, 60);
  }, [data.attempts, onlyReview]);
  const pending = data.attempts.filter((a) => a.confidence === 'review').length;
  return (
    <Card title="Capturas" aside={<label className="check small"><input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} /> Solo pendientes ({pending})</label>}>
      {list.length ? <ul className="caps">{list.map((a) => <CaptureRow key={a.id} a={a} q={qmap.get(a.questionKey)} />)}</ul> : <Empty>{onlyReview ? 'No hay capturas pendientes de revisión.' : 'Aún no hay capturas.'}</Empty>}
    </Card>
  );
}

function CaptureRow({ a, q }: { a: Attempt; q: Question | undefined }) {
  const [sel, setSel] = useState<number>(a.selectedIndex ?? 0);
  const [cor, setCor] = useState<number>(a.correctIndex ?? 0);
  const confirmed = a.confidence === 'confirmed';
  const topic = q ? topicOf(q) : null;
  return (
    <li className={`cap ${confirmed ? '' : 'pending'}`}>
      <div className="row-top">
        <span className={`pill ${confirmed ? 'ok' : 'warn'}`}>{confirmed ? 'Confirmada' : 'Pendiente de revisión'}</span>
        <span className={`pill ${a.result === 'correct' ? 'good' : a.result === 'wrong' ? 'bad' : ''}`}>{a.result === 'correct' ? 'Acierto' : a.result === 'wrong' ? 'Fallo' : 'Sin resultado'}</span>
        <span className="muted small push">{fmtDate(a.ts)}{a.source === 'review' ? ' · repaso' : ''}{a.source === 'manual' ? ' · corregida a mano' : ''}</span>
      </div>
      <p className="stem">{q?.stem ?? '(pregunta eliminada)'}</p>
      {q && <QuestionImage q={q} compact />}
      {a.result === 'wrong' && confirmed && <p className="muted small">Elegiste: {a.selectedText ?? '—'} · Correcta: {a.correctText ?? '—'}</p>}
      {!confirmed && q && (
        <div className="resolve">
          <p className="small">{a.reason ?? 'No se pudo identificar con seguridad la respuesta.'} Indica qué ocurrió:</p>
          <label className="small">Elegida<select value={sel} onChange={(e) => setSel(+e.target.value)}>{q.options.map((o, i) => <option key={i} value={i}>{o}</option>)}</select></label>
          <label className="small">Correcta<select value={cor} onChange={(e) => setCor(+e.target.value)}>{q.options.map((o, i) => <option key={i} value={i}>{o}</option>)}</select></label>
          <button className="btn small" onClick={() => send({ type: 'teoriq:resolve', attemptId: a.id, selectedIndex: sel, correctIndex: cor })}>Confirmar</button>
        </div>
      )}
      <div className="row-top small">
        {q && (
          <label>Tema{' '}
            <select value={q.manualCategory ?? ''} onChange={(e) => send({ type: 'teoriq:set-category', questionKey: q.key, category: e.target.value || null })}>
              <option value="">{topic?.origin === 'none' ? UNCLASSIFIED : `${topic?.topic} (auto)`}</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        <button className="link push" onClick={() => { if (confirm('¿Eliminar este registro?')) void send({ type: 'teoriq:delete-attempt', attemptId: a.id }); }}>Eliminar</button>
      </div>
    </li>
  );
}

/* ───────────── DATOS ───────────── */
export function DataView({ data }: P) {
  const [msg, setMsg] = useState<{ kind: 'info' | 'warn'; text: string } | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const file = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    const r = await send({ type: 'teoriq:export' });
    if (!r.ok) return setMsg({ kind: 'warn', text: r.error });
    const blob = new Blob([r.data as string], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `teoriq-copia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setMsg({ kind: 'info', text: `Copia exportada: ${data.attempts.length} intentos y ${data.questions.length} preguntas.` });
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    if (mode === 'replace' && !confirm('Se sustituirán TODOS los datos actuales por los de la copia. ¿Continuar?')) return;
    const r = await send({ type: 'teoriq:import', json: await f.text(), mode });
    if (file.current) file.current.value = '';
    if (!r.ok) return setMsg({ kind: 'warn', text: r.error });
    const d = r.data as { questions: number; attempts: number; skipped: number };
    setMsg({ kind: 'info', text: `Importado. Ahora tienes ${d.attempts} intentos y ${d.questions} preguntas${d.skipped ? ` (${d.skipped} registros dañados omitidos)` : ''}.` });
  };
  const wipe = async () => {
    if (!confirm('¿Borrar TODOS los datos de TEORIQ de este navegador? Esta acción no se puede deshacer. Exporta una copia antes.')) return;
    await send({ type: 'teoriq:wipe' });
    setMsg({ kind: 'info', text: 'Datos borrados.' });
  };
  return (
    <>
      <Card title="Copia de seguridad">
        <p>Tus datos viven solo en este navegador. Exporta una copia de vez en cuando (y antes de desinstalar o cambiar de equipo).</p>
        <button className="btn primary" onClick={doExport}>Exportar a JSON</button>
        <hr />
        <fieldset className="radio"><legend>Al importar</legend>
          <label><input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} /> Fusionar con mis datos (sin duplicar)</label>
          <label><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Reemplazar todo</label>
        </fieldset>
        <input ref={file} id="import-file" type="file" accept="application/json,.json" onChange={(e) => void doImport(e.target.files?.[0])} />
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </Card>
      <Card title="Privacidad">
        <p className="muted">Sin cuentas, sin servidores y sin analítica. TEORIQ solo registra las preguntas que tú ves y contestas en la plataforma y no envía nada fuera de tu navegador.</p>
        <button className="btn danger" onClick={wipe}>Borrar todos mis datos</button>
      </Card>
    </>
  );
}
