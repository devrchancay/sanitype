/**
 * OpenAI-compatible adapter.
 *
 * Sanitizes the outbound request (`messages`, `input`, `instructions`)
 * before it leaves the process. Responses are never modified. Works with the
 * official `openai` SDK and with any OpenAI-compatible client or proxy that
 * uses the same request shape.
 *
 * ```ts
 * import OpenAI from 'openai';
 * import { createSanitizer } from '@devrchancay/sanitype';
 * import { sanitizeOpenAI } from '@devrchancay/sanitype/openai';
 *
 * const openai = sanitizeOpenAI(new OpenAI(), createSanitizer());
 * await openai.chat.completions.create({ model: 'gpt-4o-mini', messages });
 * ```
 *
 * @module @devrchancay/sanitype/openai
 */
import { sanitizeParams, sanitizeParamsAsync, wrapLLMCall } from '../llm/wrap.js';
import type { LLMWrapOptions, SanitizedParams } from '../llm/wrap.js';
import type { Sanitizer } from '../sanitizer.js';
import type { SanitizeReport } from '../types.js';

/** A chat message as accepted by the Chat Completions API. */
export interface ChatMessageLike {
  role: string;
  content?: unknown;
  name?: string;
  [key: string]: unknown;
}

/** Chat Completions request parameters. */
export interface ChatCompletionParamsLike {
  messages: ChatMessageLike[];
  [key: string]: unknown;
}

/** Responses API request parameters. */
export interface ResponsesParamsLike {
  input?: unknown;
  instructions?: string | null;
  [key: string]: unknown;
}

export interface OpenAIWrapOptions {
  /**
   * Only sanitize messages with these roles. Defaults to every role.
   * Example: `['user', 'tool']` to leave developer-authored system prompts alone.
   */
  roles?: readonly string[];
  /** Called with the report for every request. */
  onReport?: (report: SanitizeReport, params: unknown) => void;
  /** Await an asynchronous token store. The wrapped call then returns a `Promise`. */
  async?: boolean;
}

const CHAT_KEYS = ['messages'] as const;
const RESPONSES_KEYS = ['input', 'instructions'] as const;

function filterByRole<P extends ChatCompletionParamsLike>(
  original: P,
  result: SanitizedParams<P>,
  roles: readonly string[] | undefined,
): SanitizedParams<P> {
  if (!roles) return result;
  const allowed = new Set(roles);
  const messages = result.params.messages.map((message, index) =>
    allowed.has(original.messages[index]?.role ?? '') ? message : original.messages[index]!,
  );
  const excluded = new Set(
    original.messages.flatMap((m, i) => (allowed.has(m.role) ? [] : [`messages[${i}]`])),
  );
  const isExcluded = (path: string) =>
    [...excluded].some((p) => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}[`));
  const entries = result.report.entries.filter((e) => !isExcluded(e.path));
  const summary: Record<string, number> = {};
  for (const entry of entries) {
    summary[entry.category] = (summary[entry.category] ?? 0) + (entry.matches ?? 1);
  }
  return {
    params: { ...result.params, messages },
    report: {
      ...result.report,
      entries,
      summary,
      modified: entries.some((e) => e.action !== 'allow'),
    },
  };
}

/** Sanitize Chat Completions parameters without calling anything. */
export function sanitizeChatCompletionParams<P extends ChatCompletionParamsLike>(
  params: P,
  sanitizer: Sanitizer,
  options: Pick<OpenAIWrapOptions, 'roles'> = {},
): SanitizedParams<P> {
  return filterByRole(params, sanitizeParams(params, sanitizer, CHAT_KEYS), options.roles);
}

/** Asynchronous variant of {@link sanitizeChatCompletionParams}. */
export async function sanitizeChatCompletionParamsAsync<P extends ChatCompletionParamsLike>(
  params: P,
  sanitizer: Sanitizer,
  options: Pick<OpenAIWrapOptions, 'roles'> = {},
): Promise<SanitizedParams<P>> {
  return filterByRole(
    params,
    await sanitizeParamsAsync(params, sanitizer, CHAT_KEYS),
    options.roles,
  );
}

/** Sanitize Responses API parameters (`input` and `instructions`) without calling anything. */
export function sanitizeResponsesParams<P extends ResponsesParamsLike>(
  params: P,
  sanitizer: Sanitizer,
): SanitizedParams<P> {
  return sanitizeParams(
    params,
    sanitizer,
    RESPONSES_KEYS as unknown as ReadonlyArray<keyof P & string>,
  );
}

/**
 * Wrap a `chat.completions.create`-shaped function. The returned function
 * has the same signature; streaming and non-streaming calls both work
 * because the return value is passed through untouched.
 */
export function wrapChatCompletions<P extends ChatCompletionParamsLike, R, Rest extends unknown[]>(
  create: (params: P, ...rest: Rest) => R,
  sanitizer: Sanitizer,
  options: OpenAIWrapOptions = {},
): (params: P, ...rest: Rest) => R {
  const { roles, onReport, async } = options;
  if (async) {
    return ((params: P, ...rest: Rest) =>
      sanitizeChatCompletionParamsAsync(params, sanitizer, { roles }).then(
        ({ params: clean, report }) => {
          onReport?.(report, params);
          return create(clean, ...rest);
        },
      )) as unknown as (params: P, ...rest: Rest) => R;
  }
  return (params: P, ...rest: Rest): R => {
    const { params: clean, report } = sanitizeChatCompletionParams(params, sanitizer, { roles });
    onReport?.(report, params);
    return create(clean, ...rest);
  };
}

/** Wrap a `responses.create`-shaped function. */
export function wrapResponses<P extends ResponsesParamsLike, R, Rest extends unknown[]>(
  create: (params: P, ...rest: Rest) => R,
  sanitizer: Sanitizer,
  options: Omit<OpenAIWrapOptions, 'roles'> = {},
): (params: P, ...rest: Rest) => R {
  const wrapOptions: LLMWrapOptions<P> & { keys: ReadonlyArray<keyof P & string> } = {
    keys: RESPONSES_KEYS as unknown as ReadonlyArray<keyof P & string>,
    onReport: options.onReport,
    async: options.async,
  };
  return wrapLLMCall(create, sanitizer, wrapOptions);
}

/** Structural shape of an OpenAI-compatible client. */
export interface OpenAIClientLike {
  chat?: { completions?: { create: (...args: any[]) => any } };
  responses?: { create: (...args: any[]) => any };
}

/**
 * Patch an OpenAI-compatible client in place so that
 * `chat.completions.create` and `responses.create` sanitize their request
 * before sending it. Returns the same client for convenience.
 */
export function sanitizeOpenAI<C extends OpenAIClientLike>(
  client: C,
  sanitizer: Sanitizer,
  options: OpenAIWrapOptions = {},
): C {
  const completions = client.chat?.completions;
  if (completions && typeof completions.create === 'function') {
    completions.create = wrapChatCompletions(
      completions.create.bind(completions),
      sanitizer,
      options,
    );
  }
  const responses = client.responses;
  if (responses && typeof responses.create === 'function') {
    responses.create = wrapResponses(responses.create.bind(responses), sanitizer, options);
  }
  return client;
}
