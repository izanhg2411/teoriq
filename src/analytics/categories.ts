// Clasificación LOCAL por palabras clave. Es una ayuda propia de TEORIQ, NO una categoría oficial
// de la autoescuela, y siempre puede corregirse a mano (Question.manualCategory).
import { normalize } from '../core/text';
import type { Question } from '../core/types';

export const CATEGORIES = [
  'Señales de tráfico',
  'Prioridad y circulación',
  'Velocidades',
  'Distancias y adelantamientos',
  'Seguridad vial',
  'Seguridad activa y pasiva',
  'Mecánica y mantenimiento',
  'Documentación',
  'Sanciones y puntos',
  'Alcohol y drogas',
  'Maniobras',
  'Transporte de personas y mercancías',
] as const;
export const UNCLASSIFIED = 'Sin clasificar';

// Las palabras se comparan sobre texto normalizado (sin tildes) y como prefijo de palabra.
const KEYWORDS: Record<(typeof CATEGORIES)[number], string[]> = {
  'Señales de tráfico': ['senal', 'senales', 'panel', 'semaforo', 'marca vial', 'marcas viales', 'linea continua', 'linea discontinua', 'indica la senal', 'significado', 'agente de la circulacion', 'balizamiento'],
  'Prioridad y circulación': ['prioridad', 'ceda el paso', 'cedera', 'interseccion', 'glorieta', 'rotonda', 'cruce', 'stop', 'preferencia', 'carril', 'sentido de circulacion', 'calzada', 'autovia', 'autopista', 'incorporacion'],
  'Velocidades': ['velocidad', 'km h', 'kmh', 'limite de velocidad', 'moderar', 'velocidad maxima', 'velocidad minima'],
  'Distancias y adelantamientos': ['distancia', 'adelantar', 'adelantamiento', 'separacion', 'seguridad lateral', 'distancia de detencion', 'distancia de reaccion', 'distancia de frenado', 'rebasar', 'alcance'],
  'Seguridad vial': ['accidente', 'conductor', 'fatiga', 'cansancio', 'somnolencia', 'distraccion', 'telefono movil', 'movil', 'auriculares', 'peaton', 'ciclista', 'motorista', 'visibilidad', 'niebla', 'lluvia', 'hielo', 'nieve', 'vigilancia', 'auxilio', 'primeros auxilios', 'herido', 'emergencia', 'triangulo', 'chaleco'],
  'Seguridad activa y pasiva': ['seguridad pasiva', 'seguridad activa', 'cinturon', 'airbag', 'reposacabezas', 'casco', 'sri', 'sistema de retencion', 'abs', 'esp', 'control de estabilidad', 'frenos', 'direccion asistida', 'neumatico', 'amortiguador', 'isofix'],
  'Mecánica y mantenimiento': ['motor', 'aceite', 'refrigerante', 'bateria', 'correa', 'filtro', 'embrague', 'caja de cambios', 'bujia', 'inyeccion', 'combustible', 'consumo', 'escape', 'catalizador', 'testigo', 'piloto', 'mantenimiento', 'revision', 'itv', 'presion', 'desgaste', 'alternador', 'liquido'],
  'Documentación': ['documentacion', 'permiso de circulacion', 'permiso de conducir', 'licencia', 'seguro', 'itv', 'tarjeta', 'matricula', 'titular', 'canje', 'vigencia', 'renovacion', 'ficha tecnica', 'duplicado', 'obligatorio llevar'],
  'Sanciones y puntos': ['sancion', 'multa', 'punto', 'puntos', 'infraccion', 'leve', 'grave', 'muy grave', 'retirada', 'inmovilizacion', 'perdida de vigencia', 'delito', 'saldo', 'recuperar'],
  'Alcohol y drogas': ['alcohol', 'alcoholemia', 'tasa', 'drogas', 'estupefaciente', 'medicamento', 'etilico', 'positivo', 'sangre', 'aire espirado', 'test de'],
  'Maniobras': ['maniobra', 'marcha atras', 'estacionar', 'aparcar', 'aparcamiento', 'parada', 'estacionamiento', 'giro', 'giros', 'cambio de sentido', 'cambio de carril', 'incorporarse', 'detencion', 'intermitente', 'senalizar la maniobra', 'frenar', 'arrancar'],
  'Transporte de personas y mercancías': ['mercancia', 'carga', 'pasajero', 'ocupantes', 'remolque', 'transporte', 'plazas', 'masa maxima', 'mma', 'mop', 'caravana', 'sobresalga', 'saliente', 'portaequipajes', 'ninos', 'menores de'],
};

const PREPARED = (Object.entries(KEYWORDS) as [(typeof CATEGORIES)[number], string[]][]).map(([cat, kws]) => ({
  cat,
  kws: kws.map((k) => ({ re: new RegExp(`(^| )${k.replace(/ /g, ' ')}`), len: k.split(' ').length })),
}));

/** Clasifica por palabras clave. El enunciado pesa el doble que las opciones. Devuelve null si no hay señal. */
export function classify(stem: string, options: string[]): string | null {
  const s = ` ${normalize(stem)}`.trim();
  const o = normalize(options.join(' . '));
  let best: string | null = null;
  let bestScore = 0;
  for (const { cat, kws } of PREPARED) {
    let score = 0;
    for (const { re, len } of kws) {
      if (re.test(s)) score += 2 * len;
      if (re.test(o)) score += len;
    }
    if (score > bestScore) { best = cat; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}

export interface TopicInfo { topic: string; origin: 'manual' | 'platform' | 'auto' | 'none' }

/** Tema efectivo de una pregunta: manual > plataforma > automático > sin clasificar. */
export function topicOf(q: Question): TopicInfo {
  if (q.manualCategory) return { topic: q.manualCategory, origin: 'manual' };
  if (q.platformCategory) return { topic: q.platformCategory, origin: 'platform' };
  const auto = classify(q.stem, q.options);
  return auto ? { topic: auto, origin: 'auto' } : { topic: UNCLASSIFIED, origin: 'none' };
}
