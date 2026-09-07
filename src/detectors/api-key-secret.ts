import { maskGeneric } from '../actions/mask.js';
import { defineDetector } from './define.js';
import type { PatternSpec } from './define.js';

const PATTERNS: ReadonlyArray<RegExp | PatternSpec> = [
  // AWS access key IDs
  /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA)[0-9A-Z]{16}\b/,
  // GitHub tokens (classic, fine-grained, OAuth, app)
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
  // Stripe keys
  /\b[sr]k_(?:live|test)_[0-9a-zA-Z]{20,}\b/,
  /\bpk_(?:live|test)_[0-9a-zA-Z]{20,}\b/,
  /\bwhsec_[0-9a-zA-Z]{20,}\b/,
  // OpenAI / Anthropic style keys (sk-..., sk-proj-..., sk-ant-...)
  /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/,
  // Slack tokens
  /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/,
  // Google API keys
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  // SendGrid
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
  // Twilio
  /\b(?:SK|AC)[0-9a-f]{32}\b/,
  // npm tokens
  /\bnpm_[A-Za-z0-9]{36}\b/,
  // JSON Web Tokens
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  // Bearer tokens in headers or text
  { regex: /\bBearer\s+([A-Za-z0-9._~+/=-]{20,})/i, group: 1 },
  // PEM private key blocks
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/,
  // Generic `api_key=...` / `secret: "..."` / `password=...` assignments
  {
    regex:
      /\b(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|password|passwd|pwd)\b["']?\s*[:=]\s*["']?([^\s"',;]{8,})/i,
    group: 1,
  },
];

// Every pattern above contains one of these literals, so strings without any
// of them can be skipped without running the full pattern list.
const KEY_HINT =
  /AKIA|ASIA|AGPA|AIDA|AROA|ANPA|gh[pousr]_|github_pat_|[sr]k_(?:live|test)|pk_(?:live|test)|whsec_|sk-|xox[abposr]-|AIza|SG\.|SK[0-9a-f]|AC[0-9a-f]|npm_|eyJ|bearer|-----BEGIN|api|secret|token|password|passwd|pwd|private/i;

/**
 * API keys, access tokens and other credentials: AWS, GitHub, Stripe, OpenAI,
 * Anthropic, Slack, Google, SendGrid, Twilio, npm, JWTs, bearer tokens, PEM
 * private keys and generic `api_key=...` / `password: ...` assignments.
 *
 * Mask keeps the first four characters so the key type stays recognisable:
 * `sk_live_abc...` -> `sk_l****...`.
 */
export const apiKeySecret = defineDetector({
  name: 'api_key_secret',
  pattern: PATTERNS,
  prefilter: (value) => value.length >= 8 && KEY_HINT.test(value),
  priority: 95,
  mask: (value, options) => `${value.slice(0, 4)}${maskGeneric(value.slice(4), options)}`,
});
