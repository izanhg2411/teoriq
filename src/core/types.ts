// Tipos compartidos por todos los módulos. Sin dependencias del navegador.

export type Confidence = 'confirmed' | 'review';
export type Result = 'correct' | 'wrong' | 'unknown';
export type AttemptSource = 'platform' | 'review' | 'manual';

/** Lo que el adaptador de una plataforma lee del DOM (sin interpretar). */
export interface OptionSnapshot {
  text: string;
  /** Indicador de "correcta" realmente visible. */
  checkVisible: boolean;
  /** Indicador de "incorrecta" realmente visible. */
  timesVisible: boolean;
}
export interface QuestionSnapshot {
  stem: string;
  options: OptionSnapshot[];
  /** Id propio de la plataforma si se pudiera leer con seguridad (hoy: siempre null). */
  externalId: string | null;
  /** Categoría que da la plataforma, si la hay (hoy: siempre null). */
  platformCategory: string | null;
  /** Imagen de la pregunta tal como la pinta la plataforma (data URI), si hay una única imagen visible; si no, null. */
  imageSrc: string | null;
}

export type EvaluationState = 'no-correction' | 'correct' | 'wrong' | 'review';
/** Interpretación de un snapshot. */
export interface Evaluation {
  state: EvaluationState;
  selectedIndex: number | null;
  correctIndex: number | null;
  /** Por qué se marca "review" (para depurar y mostrar al usuario). */
  reason?: string;
}

/** Captura que el content script envía al background. */
export interface CapturePayload {
  platform: string;
  key: string;
  externalId: string | null;
  platformCategory: string | null;
  stem: string;
  options: string[];
  selectedIndex: number | null;
  correctIndex: number | null;
  result: Result;
  confidence: Confidence;
  reason?: string;
  ts: number;
  responseMs: number | null;
  /** Imagen de la pregunta. El motor la emite tal cual (data URI) y el content script la reduce a JPEG pequeño antes de enviarla. */
  imageData?: string | null;
}

export interface Attempt {
  id: string;
  questionKey: string;
  platform: string;
  ts: number;
  result: Result;
  confidence: Confidence;
  source: AttemptSource;
  selectedIndex: number | null;
  correctIndex: number | null;
  /** Textos elegidos/correctos, por si la plataforma cambia el orden de las opciones. */
  selectedText: string | null;
  correctText: string | null;
  responseMs: number | null;
  reason?: string;
}

export interface Question {
  key: string;
  platform: string;
  externalId: string | null;
  stem: string;
  options: string[];
  /** Texto de la respuesta correcta, solo cuando se ha confirmado. */
  correctText: string | null;
  platformCategory: string | null;
  /** Corrección manual del usuario; manda sobre la clasificación automática. */
  manualCategory: string | null;
  /** Imagen reducida (JPEG en data URI) de la pregunta, guardada una vez; null/ausente si no hay o aún no se ha visto. */
  imageData?: string | null;
  firstSeen: number;
  lastSeen: number;
}

export interface Settings {
  examDate: string | null; // YYYY-MM-DD
  minutesPerDay: number;
  questionsPerDay: number;
  showToast: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  examDate: null,
  minutesPerDay: 30,
  questionsPerDay: 30,
  showToast: true,
};

export const DAY_MS = 86_400_000;
export const MIN_ATTEMPTS_GLOBAL = 30; // por debajo, los datos son insuficientes
export const MIN_ATTEMPTS_TOPIC = 5; // por debajo, un tema no se ordena por tasa de error

// Mensajes content/panel -> background
export type Msg =
  | { type: 'teoriq:capture'; payload: CapturePayload }
  | { type: 'teoriq:record-review'; questionKey: string; correct: boolean; selectedText: string | null }
  | { type: 'teoriq:resolve'; attemptId: string; selectedIndex: number; correctIndex: number }
  | { type: 'teoriq:set-category'; questionKey: string; category: string | null }
  | { type: 'teoriq:delete-attempt'; attemptId: string }
  | { type: 'teoriq:import'; json: string; mode: 'merge' | 'replace' }
  | { type: 'teoriq:export' }
  | { type: 'teoriq:wipe' }
  | { type: 'teoriq:set-settings'; settings: Partial<Settings> };

export type Reply = { ok: true; data?: unknown } | { ok: false; error: string };
