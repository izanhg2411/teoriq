// Interpreta un snapshot: ¿hay corrección?, ¿cuál es la elegida y cuál la correcta?
// Lógica pura y conservadora: ante la menor duda devuelve "review" (nunca inventa un resultado confirmado).
import type { Evaluation, QuestionSnapshot } from '../core/types';

export function evaluate(snap: QuestionSnapshot): Evaluation {
  const checks: number[] = [];
  const times: number[] = [];
  snap.options.forEach((o, i) => {
    if (o.checkVisible) checks.push(i);
    if (o.timesVisible) times.push(i);
  });

  if (checks.length === 0 && times.length === 0) return { state: 'no-correction', selectedIndex: null, correctIndex: null };

  // Acierto: solo la correcta marcada, sin ningún indicador de error.
  if (checks.length === 1 && times.length === 0) {
    return { state: 'correct', selectedIndex: checks[0]!, correctIndex: checks[0]! };
  }
  // Error: una marcada como incorrecta (la elegida) y otra distinta como correcta.
  if (checks.length === 1 && times.length === 1 && checks[0] !== times[0]) {
    return { state: 'wrong', selectedIndex: times[0]!, correctIndex: checks[0]! };
  }

  // Cualquier otra combinación: no se puede identificar con seguridad.
  let reason: string;
  if (times.length === 1 && checks.length === 0) reason = 'Se ve la respuesta marcada como incorrecta, pero no la correcta.';
  else if (checks.length > 1) reason = 'Hay varias respuestas marcadas como correctas.';
  else if (times.length > 1) reason = 'Hay varias respuestas marcadas como incorrectas.';
  else if (checks.length === 1 && times.length === 1) reason = 'La misma opción aparece como correcta e incorrecta.';
  else reason = 'Indicadores de corrección incoherentes.';
  return {
    state: 'review',
    selectedIndex: times.length === 1 ? times[0]! : null,
    correctIndex: checks.length === 1 ? checks[0]! : null,
    reason,
  };
}
