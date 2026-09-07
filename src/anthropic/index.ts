/**
 * Anthropic adapter.
 *
 * Sanitizes `messages` and `system` of a Messages API request before it
 * leaves the process. Responses are never modified.
 *
 * ```ts
 * import Anthropic from '@anthropic-ai/sdk';
 * import { createSanitizer } from 'sanitype';
 * import { sanitizeAnthropic } from 'sanitype/anthropic';
 *
 * const anthropic = sanitizeAnthropic(new Anthropic(), createSanitizer());
 * await anthropic.messages.create({ model: 'claude-sonnet-5', max_tokens: 1024, messages });
 * ```
 *
 * @module sanitype/anthropic
 */
import { sanitizeParams, sanitizeParamsAsync, wrapLLMCall } from '../llm/wrap.js';
import type { LLMWrapOptions, SanitizedParams } from '../llm/wrap.js';
import type { Sanitizer } from '../sanitizer.js';
import type { SanitizeReport } from '../types.js';

/** Messages API request parameters. */
export interface MessageParamsLike {
  messages: Array<{ role: string; content: unknown; [key: string]: unknown }>;
  system?: unknown;
  [key: string]: unknown;
}

export interface AnthropicWrapOptions {
  /** Sanitize the `system` prompt too. Defaults to `true`. */
  system?: boolean;
  /** Called with the report for every request. */
  onReport?: (report: SanitizeReport, params: unknown) => void;
  /** Await an asynchronous token store. The wrapped call then returns a `Promise`. */
  async?: boolean;
}

function keysFor(options: AnthropicWrapOptions): ReadonlyArray<'messages' | 'system'> {
  return options.system === false ? ['messages'] : ['messages', 'system'];
}

/** Sanitize Messages API parameters without calling anything. */
export function sanitizeMessageParams<P extends MessageParamsLike>(
  params: P,
  sanitizer: Sanitizer,
  options: Pick<AnthropicWrapOptions, 'system'> = {},
): SanitizedParams<P> {
  return sanitizeParams(params, sanitizer, keysFor(options));
}

/** Asynchronous variant of {@link sanitizeMessageParams}. */
export function sanitizeMessageParamsAsync<P extends MessageParamsLike>(
  params: P,
  sanitizer: Sanitizer,
  options: Pick<AnthropicWrapOptions, 'system'> = {},
): Promise<SanitizedParams<P>> {
  return sanitizeParamsAsync(params, sanitizer, keysFor(options));
}

/** Wrap a `messages.create`-shaped function. */
export function wrapMessages<P extends MessageParamsLike, R, Rest extends unknown[]>(
  create: (params: P, ...rest: Rest) => R,
  sanitizer: Sanitizer,
  options: AnthropicWrapOptions = {},
): (params: P, ...rest: Rest) => R {
  const wrapOptions: LLMWrapOptions<P> & { keys: ReadonlyArray<keyof P & string> } = {
    keys: keysFor(options) as ReadonlyArray<keyof P & string>,
    onReport: options.onReport,
    async: options.async,
  };
  return wrapLLMCall(create, sanitizer, wrapOptions);
}

/** Structural shape of an Anthropic client. */
export interface AnthropicClientLike {
  messages?: { create: (...args: any[]) => any };
}

/** Patch an Anthropic client in place so that `messages.create` sanitizes its request. */
export function sanitizeAnthropic<C extends AnthropicClientLike>(
  client: C,
  sanitizer: Sanitizer,
  options: AnthropicWrapOptions = {},
): C {
  const messages = client.messages;
  if (messages && typeof messages.create === 'function') {
    messages.create = wrapMessages(messages.create.bind(messages), sanitizer, options);
  }
  return client;
}
