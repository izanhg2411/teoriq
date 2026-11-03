// Selectores de AEOLCLOUD. TODOS proceden de la evidencia real del DOM (Chrome DevTools -> Copy outerHTML)
// aportada por el usuario. No añadir selectores sin evidencia.
export const SEL = {
  question: '.question', // contenedor principal
  stem: 'h2.configsize', // enunciado
  answer: '.answer', // cada opción de respuesta
  answerText: '.texto-respuesta', // texto de la opción
  iconCorrect: '.fa-check', // indicador de respuesta correcta
  iconWrong: '.fa-times', // indicador de respuesta incorrecta (la elegida)
  // Imagen de la pregunta: <img ng-if="currentTest.foto64" class="imagewrapper" src="data:image/png;base64,..."> (evidencia real, 2026-11-01).
  // La foto viene incrustada en el HTML (data URI): no hay URL ni petición de red.
  image: 'img.imagewrapper',
} as const;

// PENDIENTE (sin evidencia; NO inventar): ubicación exacta de la imagen respecto a `.question` (se busca en todo el documento),
// identificador interno de la pregunta (currentTest.preguntaCodigo) y tema/categoría de la plataforma.
