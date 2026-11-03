import type { ReactNode } from 'react';
import type { DayPoint } from '../analytics/stats';

export const pct = (x: number | null, digits = 0) => (x === null ? '—' : `${(x * 100).toFixed(digits)}%`);
export const fmtDate = (ts: number) => new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

export function Card({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card">
      {(title || aside) && <header className="card-h">{title && <h2>{title}</h2>}{aside}</header>}
      {children}
    </section>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn'; children: ReactNode }) {
  return <p className={`notice ${kind}`} role={kind === 'warn' ? 'alert' : undefined}>{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Bar({ value, tone = 'bad' }: { value: number; tone?: 'bad' | 'good' | 'mid' }) {
  return <span className="bar" aria-hidden><span className={`bar-fill ${tone}`} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} /></span>;
}

/** Evolución de la precisión diaria (SVG, sin dependencias). Cada punto es un día con intentos. */
export function EvolutionChart({ points }: { points: DayPoint[] }) {
  if (points.length < 2) return <Empty>La gráfica aparecerá cuando tengas resultados de al menos dos días distintos.</Empty>;
  const pts = points.slice(-30);
  const W = 320, H = 130, L = 30, R = 8, T = 8, B = 22;
  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const maxN = Math.max(...pts.map((p) => p.answered));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.accuracy).toFixed(1)}`).join(' ');
  return (
    <figure className="chart" aria-label="Evolución del porcentaje de aciertos por día">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {[0, 0.5, 1].map((g) => (
          <g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="grid" /><text x={L - 5} y={y(g) + 3} className="tick" textAnchor="end">{g * 100}%</text></g>
        ))}
        {pts.map((p, i) => <rect key={p.day} x={x(i) - 3} width={6} y={H - B - (p.answered / maxN) * 22} height={(p.answered / maxN) * 22} className="vol"><title>{p.answered} preguntas</title></rect>)}
        <path d={path} className="line" fill="none" />
        {pts.map((p, i) => <circle key={p.day} cx={x(i)} cy={y(p.accuracy)} r={3} className="dot"><title>{fmtDay(p.day)}: {pct(p.accuracy)} de {p.answered}</title></circle>)}
        <text x={L} y={H - 4} className="tick">{fmtDay(pts[0]!.day)}</text>
        <text x={W - R} y={H - 4} className="tick" textAnchor="end">{fmtDay(pts[pts.length - 1]!.day)}</text>
      </svg>
      <figcaption>Línea: % de aciertos del día. Barras: nº de preguntas.</figcaption>
    </figure>
  );
}
