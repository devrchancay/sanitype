/**
 * sanitype — schema-aware, in-process PII scrubbing for TypeScript.
 *
 * @packageDocumentation
 */
export {
  createSanitizer,
  sanitize,
  sanitizeAsync,
  DEFAULT_MAX_STRING_LENGTH,
} from './sanitizer.js';
export type { Sanitizer, ActiveDetector } from './sanitizer.js';

export {
  builtinDetectors,
  defaultDetectorNames,
  heuristicDetectorNames,
  isBuiltinDetectorName,
  defineDetector,
  resolveOverlaps,
  luhnCheck,
  isEcuadorianCedula,
  email,
  phone,
  creditCard,
  ipAddress,
  ssnUs,
  cedulaEc,
  apiKeySecret,
  personName,
  physicalAddress,
} from './detectors/index.js';
export type { DetectorDefinition, PatternSpec } from './detectors/index.js';

export {
  hashValue,
  maskGeneric,
  maskKeepFirst,
  maskKeepLast,
  maskWordsKeepInitial,
  defaultRedactFormat,
  redactValue,
  createInMemoryTokenStore,
} from './actions/index.js';
export type { InMemoryTokenStore, InMemoryTokenStoreOptions } from './actions/index.js';

export { formatPath, parsePathPattern, ROOT_PATH } from './paths.js';

export { wrapLLMCall, sanitizeParams, sanitizeParamsAsync } from './llm/wrap.js';
export type { LLMWrapOptions, SanitizedParams } from './llm/wrap.js';

export { ACTIONS } from './types.js';
export type {
  Action,
  BuiltinDetectorName,
  Confidence,
  DetectionResult,
  Detector,
  DetectorConfig,
  DetectorMatch,
  DetectorOverride,
  DetectorSetting,
  FieldRule,
  FieldRules,
  HashOptions,
  MaskOptions,
  RedactOptions,
  ReportEntry,
  ReportSource,
  SanitizeReport,
  SanitizeResult,
  SanitizerConfig,
  SkipReason,
  SkippedEntry,
  TokenStore,
  TokenizeContext,
} from './types.js';
