import type { BuiltinDetectorName, Detector } from '../types.js';
import { apiKeySecret } from './api-key-secret.js';
import { cedulaEc } from './cedula-ec.js';
import { creditCard } from './credit-card.js';
import { email } from './email.js';
import { ipAddress } from './ip-address.js';
import { personName } from './person-name.js';
import { phone } from './phone.js';
import { physicalAddress } from './physical-address.js';
import { ssnUs } from './ssn-us.js';

export { defineDetector, collectMatches, dedupeMatches, countDigits } from './define.js';
export type { DetectorDefinition, PatternSpec } from './define.js';
export { resolveOverlaps } from './resolve.js';
export { luhnCheck } from './credit-card.js';
export { isEcuadorianCedula } from './cedula-ec.js';
export {
  email,
  phone,
  creditCard,
  ipAddress,
  ssnUs,
  cedulaEc,
  apiKeySecret,
  personName,
  physicalAddress,
};

/** Every built-in detector, keyed by name. */
export const builtinDetectors: Readonly<Record<BuiltinDetectorName, Detector>> = Object.freeze({
  email,
  phone,
  credit_card: creditCard,
  ip_address: ipAddress,
  ssn_us: ssnUs,
  cedula_ec: cedulaEc,
  api_key_secret: apiKeySecret,
  person_name: personName,
  physical_address: physicalAddress,
});

/** Names of the detectors that are enabled by default (all `high` confidence ones). */
export const defaultDetectorNames: readonly BuiltinDetectorName[] = Object.freeze(
  (Object.keys(builtinDetectors) as BuiltinDetectorName[]).filter(
    (name) => builtinDetectors[name].confidence === 'high',
  ),
);

/** Names of the opt-in heuristic detectors. */
export const heuristicDetectorNames: readonly BuiltinDetectorName[] = Object.freeze(
  (Object.keys(builtinDetectors) as BuiltinDetectorName[]).filter(
    (name) => builtinDetectors[name].confidence === 'heuristic',
  ),
);

export function isBuiltinDetectorName(name: string): name is BuiltinDetectorName {
  return Object.prototype.hasOwnProperty.call(builtinDetectors, name);
}
