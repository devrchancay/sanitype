import { maskGeneric } from '../actions/mask.js';
import { defineDetector } from './define.js';

const STREET_TYPES =
  'Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Square|Sq|Terrace|Ter|Highway|Hwy|Parkway|Pkwy|Circle|Cir|Trail|Trl|Alley|Aly|Crescent|Cres|Close|Cl';

const UNIT = '(?:Apt|Apartment|Suite|Ste|Unit|Floor|Fl|Room|Rm|#)\\.?\\s*[A-Za-z0-9-]+';

// 221B Baker Street, Apt 4; 1600 Pennsylvania Ave NW, Washington, DC 20500
const ENGLISH = new RegExp(
  `\\b\\d{1,6}[A-Za-z]?(?:\\s+[A-Za-z0-9'.-]+){1,5}\\s+(?:${STREET_TYPES})\\b\\.?(?:\\s+(?:NE|NW|SE|SW|N|S|E|W)\\b)?(?:,?\\s*${UNIT})?(?:,\\s*[A-Za-z][A-Za-z'-]*(?:\\s[A-Za-z][A-Za-z'-]*){0,2},?(?:\\s+[A-Z]{2})?(?:\\s+\\d{5}(?:-\\d{4})?)?)?`,
  'i',
);

const SPANISH_TYPES =
  'Calle|Cl|Cll|Carrera|Cra|Kr|Avenida|Av|Avda|Pasaje|Pje|Jirón|Jiron|Jr|Camino|Paseo|Plaza|Vía|Via|Ruta|Diagonal|Transversal|Tv|Bulevar|Boulevard';

// Av. Amazonas N32-45; Calle 10 # 5-23; Carrera 7 No. 71-21, Bogotá
const SPANISH = new RegExp(
  `\\b(?:${SPANISH_TYPES})\\.?\\s+[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ'.-]+(?:\\s+(?:de|del|la|las|los|y|e)?\\s*[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ'.-]+){0,4}?\\s*(?:#|No\\.?|Nº|N°|N)?\\s*[A-Z]?\\d{1,5}[A-Za-z]?(?:\\s*[-–]\\s*[A-Za-z]?\\d{1,5})?(?:\\s*(?:y|e)\\s+[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ'.-]+)?(?:,?\\s*(?:Piso|Dpto|Depto|Of|Oficina|Local|Int)\\.?\\s*[A-Za-z0-9-]+)?`,
  'i',
);

/**
 * Heuristic street-address detector (opt-in).
 *
 * Covers the common English pattern `<number> <street name> <street type>`
 * with optional unit, city, state and ZIP code, and the common Spanish
 * pattern `<Calle|Av.|Carrera ...> <name> <number>` used across Latin
 * America. Addresses that do not include a street type or number are not
 * detected, and text that mentions street types in other contexts (e.g. a
 * business called "10 Downing Street Ltd") will match. Treat it as
 * best-effort.
 */
export const physicalAddress = defineDetector({
  name: 'physical_address',
  pattern: [ENGLISH, SPANISH],
  prefilter: (value) => /\d/.test(value),
  confidence: 'heuristic',
  priority: 40,
  mask: (value, options) => maskGeneric(value, options),
});
