import type { PlatformAdapter } from '../types';
import type { OptionSnapshot, QuestionSnapshot } from '../../core/types';
import { clean } from '../../core/text';
import { isReallyVisible } from '../dom';
import { SEL } from './selectors';

const UNRENDERED = /\{\{|\}\}/; // plantilla de Angular aún sin compilar

/** Imagen de la pregunta: única `img.imagewrapper` visible con data URI. Con 0 o con varias imágenes distintas → null (no se adivina). */
function readImage(el: Element): string | null {
  const srcs = new Set<string>();
  for (const img of Array.from(el.ownerDocument.querySelectorAll(SEL.image))) {
    if (img.closest(SEL.answer) || !isReallyVisible(img)) continue;
    const src = (img.getAttribute('src') ?? '').trim();
    if (!/^data:image\/[a-z+.-]+;base64,/i.test(src) || UNRENDERED.test(src)) continue;
    srcs.add(src);
  }
  return srcs.size === 1 ? [...srcs][0]! : null;
}

export const aeolcloud: PlatformAdapter = {
  id: 'aeolcloud',
  name: 'AEOLCLOUD',
  // En el build de producción solo AEOLCLOUD. El build --dev añade localhost para la página de pruebas.
  matches: typeof __TEORIQ_DEV__ !== 'undefined' && __TEORIQ_DEV__ ? ['https://cloud.aeolservice.es/*', 'http://localhost/*'] : ['https://cloud.aeolservice.es/*'],

  questionElements(root) {
    // Solo contenedores con enunciado, y sin otro candidato anidado dentro.
    const all = Array.from(root.querySelectorAll(SEL.question)).filter((q) => q.querySelector(SEL.stem));
    return all.filter((q) => !all.some((o) => o !== q && q.contains(o)));
  },

  read(el): QuestionSnapshot | null {
    const stem = clean(el.querySelector(SEL.stem)?.textContent);
    if (!stem || UNRENDERED.test(stem)) return null;

    const options: OptionSnapshot[] = [];
    for (const a of Array.from(el.querySelectorAll(SEL.answer))) {
      const text = clean(a.querySelector(SEL.answerText)?.textContent ?? a.textContent);
      if (!text || UNRENDERED.test(text)) return null;
      options.push({
        text,
        checkVisible: Array.from(a.querySelectorAll(SEL.iconCorrect)).some(isReallyVisible),
        timesVisible: Array.from(a.querySelectorAll(SEL.iconWrong)).some(isReallyVisible),
      });
    }
    if (options.length < 2) return null;
    return { stem, options, externalId: null, platformCategory: null, imageSrc: readImage(el) };
  },
};
