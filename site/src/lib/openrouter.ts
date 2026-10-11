// OpenRouter chat client for the criteria preprocessing (Gemini by default).
//
// Emits: a trial's public registry text (title, conditions, eligibility) and
// the prompt. No patient data ever goes through this client.

import type { Complete, CompletionRequest } from '../engine/preprocess/preprocess.ts';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Cheapest Gemini on OpenRouter with structured outputs, checked 2026-10-11: $0.10 in / $0.40 out per 1M tokens. */
export const DEFAULT_CRITERIA_MODEL = 'google/gemini-2.5-flash-lite';

/** USD per 1M tokens [input, output], from https://openrouter.ai/api/v1/models on 2026-10-11. */
export const PRICES: Record<string, [number, number]> = {
  'google/gemini-2.5-flash-lite': [0.1, 0.4],
  'google/gemini-2.5-flash': [0.3, 2.5],
  'google/gemini-3.1-flash-lite': [0.25, 1.5],
  'google/gemini-3-flash-preview': [0.5, 3],
};

export function openRouterComplete(
  apiKey: string,
  model: string,
  { retries = 3, fetchImpl = fetch }: { retries?: number; fetchImpl?: typeof fetch } = {},
): Complete {
  return async (req: CompletionRequest) => {
    const body = JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'eligibility_criteria', strict: true, schema: req.schema },
      },
      // Only route to providers that honour response_format.
      provider: { require_parameters: true },
      usage: { include: true },
    });
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) {
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
          error?: { message?: string };
        };
        const content = json.choices?.[0]?.message?.content;
        if (!content) throw new Error(`OpenRouter: empty response ${json.error?.message ?? ''}`.trim());
        return { content, usage: json.usage };
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= retries) {
        throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 500)}`);
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  };
}
