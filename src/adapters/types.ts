import type { QuestionSnapshot } from '../core/types';

/**
 * Un adaptador sabe leer el DOM de UNA plataforma de autoescuela.
 * No interpreta aciertos/errores (eso lo hace capture/evaluate.ts), solo describe lo que se ve.
 * Para añadir otra autoescuela: crear adapters/<nombre>/ y registrarlo en adapters/index.ts.
 */
export interface PlatformAdapter {
  id: string;
  name: string;
  /** Patrones de URL (formato match patterns de Chrome) donde se activa. */
  matches: string[];
  /** Elementos raíz de pregunta presentes ahora mismo en el documento. */
  questionElements(root: ParentNode): Element[];
  /** Lee una pregunta; null si todavía no está lista (p. ej. Angular sin renderizar). */
  read(el: Element): QuestionSnapshot | null;
}
