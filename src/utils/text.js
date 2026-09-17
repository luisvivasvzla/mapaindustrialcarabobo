/**
 * Normaliza cadenas de texto para búsquedas en tiempo real:
 * Convierte a minúsculas y elimina diacríticos/acentos (á -> a, é -> e, etc.)
 */
export function normalizeText(str = '') {
  if (typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Trunca nombres largos de empresas a ~22 caracteres o ~3 palabras legibles,
 * priorizando cortes en límites de palabras y eliminando preposiciones sueltas.
 */
export function formatShortCompanyName(name, maxChars = 22, maxWords = 3) {
  if (!name || typeof name !== 'string') return '';
  const clean = name.trim();
  
  // Limpiar sufijos societarios comunes si el nombre excede límites
  let sanitized = clean.replace(/,\s*(?:C\.?A\.?|S\.?A\.?|R\.?L\.?|S\.?R\.?L\.?|S\.?A\.?S\.?)\.?$/i, '').trim();
  if (sanitized.length <= maxChars && sanitized.split(/\s+/).length <= maxWords) {
    return sanitized;
  }

  const words = sanitized.split(/\s+/);
  let result = '';
  for (let i = 0; i < Math.min(words.length, maxWords); i++) {
    const candidate = result ? `${result} ${words[i]}` : words[i];
    if (candidate.length > maxChars) break;
    result = candidate;
  }

  if (!result) {
    result = words[0].slice(0, maxChars - 1);
  }

  // Quitar preposiciones o conjunciones finales que queden huérfanas
  result = result.replace(/\s+(?:de|del|la|el|y|en|con|los|las|para|por)$/i, '');

  // Quitar signos de puntuación finales antes de añadir elipsis
  return result.replace(/[,.;\-\/\s]+$/, '') + '…';
}

