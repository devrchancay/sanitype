import { maskWordsKeepInitial } from '../actions/mask.js';
import type { DetectorMatch } from '../types.js';
import { defineDetector } from './define.js';

const TITLES = /(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Sir|Sr|Sra|Srta|Dra|Ing|Lic|Don|Doña)\.?/;
const WORD = /[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ'’-]+/;
const PARTICLE = /(?:de|del|la|las|los|van|von|der|den|da|di|du|le|bin|al|y)/;

const CANDIDATE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${TITLES.source}\\s+)?${WORD.source}(?:\\s+(?:${PARTICLE.source}\\s+)*${WORD.source}){0,4}(?![\\p{L}\\p{N}])`,
  'gu',
);

/**
 * Capitalised words that frequently appear next to each other without being
 * a person's name. Matches consisting only of these words are rejected, and
 * they are trimmed from the edges of a candidate.
 */
const STOPWORDS = new Set(
  [
    // English
    'the',
    'this',
    'that',
    'these',
    'those',
    'a',
    'an',
    'and',
    'or',
    'but',
    'if',
    'then',
    'so',
    'hello',
    'hi',
    'hey',
    'dear',
    'thanks',
    'thank',
    'you',
    'please',
    'regards',
    'best',
    'kind',
    'sincerely',
    'cheers',
    'yes',
    'no',
    'ok',
    'okay',
    'sure',
    'also',
    'however',
    'therefore',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
    'new',
    'old',
    'north',
    'south',
    'east',
    'west',
    'united',
    'states',
    'kingdom',
    'america',
    'street',
    'avenue',
    'road',
    'boulevard',
    'lane',
    'drive',
    'court',
    'city',
    'town',
    'county',
    'inc',
    'ltd',
    'llc',
    'corp',
    'company',
    'group',
    'team',
    'support',
    'customer',
    'service',
    'services',
    'order',
    'invoice',
    'error',
    'warning',
    'info',
    'debug',
    'request',
    'response',
    'user',
    'account',
    'password',
    'email',
    'phone',
    'address',
    'name',
    'id',
    'api',
    'http',
    'https',
    'json',
    'server',
    'client',
    'null',
    'undefined',
    'true',
    'false',
    'none',
    'total',
    'amount',
    'price',
    'date',
    'time',
    'status',
    'type',
    'message',
    'subject',
    'report',
    'summary',
    'note',
    'notes',
    'internal',
    'external',
    'public',
    'private',
    'i',
    'we',
    'he',
    'she',
    'they',
    'it',
    'my',
    'our',
    'your',
    'his',
    'her',
    'their',
    // Spanish
    'hola',
    'buenos',
    'buenas',
    'días',
    'dias',
    'tardes',
    'noches',
    'gracias',
    'saludos',
    'atentamente',
    'cordialmente',
    'estimado',
    'estimada',
    'estimados',
    'señor',
    'señora',
    'lunes',
    'martes',
    'miércoles',
    'miercoles',
    'jueves',
    'viernes',
    'sábado',
    'sabado',
    'domingo',
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
    'calle',
    'avenida',
    'ciudad',
    'cliente',
    'usuario',
    'cuenta',
    'pedido',
    'factura',
    'total',
    'nombre',
    'correo',
    'teléfono',
    'telefono',
    'dirección',
    'direccion',
    'empresa',
    'equipo',
    'soporte',
    'el',
    'la',
    'los',
    'las',
    'un',
    'una',
    'y',
    'o',
    'pero',
    'si',
    'no',
    'con',
    'sin',
    'por',
    'para',
    'como',
    'que',
    'esto',
    'esta',
    'este',
    'ese',
    'esa',
    'nuevo',
    'nueva',
    'norte',
    'sur',
    'este',
    'oeste',
    'san',
    'santa',
    'santo',
  ].map((w) => w.toLowerCase()),
);

const NAME_HINT = /\p{Lu}\p{Ll}/u;

function isTitle(token: string): boolean {
  return new RegExp(`^${TITLES.source}$`).test(token);
}

function isParticle(token: string): boolean {
  return new RegExp(`^${PARTICLE.source}$`).test(token);
}

function findNames(value: string): DetectorMatch[] | null {
  const matches: DetectorMatch[] = [];
  for (const found of value.matchAll(CANDIDATE)) {
    const text = found[0];
    const base = found.index ?? 0;
    const tokens = text.split(/\s+/);
    const hasTitle = tokens.length > 0 && isTitle(tokens[0]!);
    let startToken = hasTitle ? 1 : 0;
    let endToken = tokens.length;

    // Trim stopwords and dangling particles from both ends.
    while (startToken < endToken) {
      const t = tokens[startToken]!;
      if (STOPWORDS.has(t.toLowerCase()) || isParticle(t)) startToken++;
      else break;
    }
    while (endToken > startToken) {
      const t = tokens[endToken - 1]!;
      if (STOPWORDS.has(t.toLowerCase()) || isParticle(t)) endToken--;
      else break;
    }
    const kept = tokens.slice(startToken, endToken);
    const nameWords = kept.filter((t) => !isParticle(t));
    // Require two name words, or one name word introduced by a title.
    if (nameWords.length < 2 && !(hasTitle && nameWords.length === 1 && startToken === 1)) {
      continue;
    }
    if (nameWords.every((t) => STOPWORDS.has(t.toLowerCase()))) continue;

    const includeTitle = hasTitle && startToken === 1;
    const firstToken = includeTitle ? 0 : startToken;
    const startOffset = indexOfToken(text, tokens, firstToken);
    const endOffset = indexOfToken(text, tokens, endToken - 1) + tokens[endToken - 1]!.length;
    matches.push({
      start: base + startOffset,
      end: base + endOffset,
      value: text.slice(startOffset, endOffset),
    });
  }
  return matches.length ? matches : null;
}

function indexOfToken(text: string, tokens: string[], index: number): number {
  let offset = 0;
  for (let i = 0; i < index; i++) {
    offset = text.indexOf(tokens[i]!, offset) + tokens[i]!.length;
  }
  return text.indexOf(tokens[index]!, offset);
}

/**
 * Heuristic person-name detector (opt-in).
 *
 * Matches sequences of two to five capitalised words (Latin script, accents
 * supported), optionally introduced by a title such as `Dr.` or `Sra.` and
 * joined by particles such as `de` or `van`. A short stopword list removes
 * common false positives (greetings, weekdays, months, generic nouns), but
 * any other pair of capitalised words, such as product names, company names
 * or city names, will match. Treat it as best-effort.
 *
 * Mask keeps initials: `John Smith` -> `J*** S****`.
 */
export const personName = defineDetector({
  name: 'person_name',
  test: findNames,
  prefilter: (value) => NAME_HINT.test(value),
  confidence: 'heuristic',
  priority: 30,
  mask: (value, options) => maskWordsKeepInitial(value, options),
});
