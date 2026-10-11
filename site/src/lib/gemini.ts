// Gemini API client for the criteria preprocessing, called directly (not via OpenRouter).
//
// Emits: a trial's public registry text (title, conditions, eligibility) and the
// prompt. No patient data ever goes through this client; on the free tier Google
// may use requests to improve its products, which is fine for public registry text.

import type { Complete, CompletionRequest } from '../engine/preprocess/preprocess.ts';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent';

/** Free on the AI Studio free tier; enough daily quota for every trial in one run. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

export function geminiComplete(
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
  { retries = 4, fetchImpl = fetch }: { retries?: number; fetchImpl?: typeof fetch } = {},
): Complete {
  return async (req: CompletionRequest) => {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: req.schema,
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
    });
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(ENDPOINT.replace('{model}', model), {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) {
        const json = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
        };
        const content = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
        if (!content) throw new Error(`Gemini: empty response (${json.candidates?.[0]?.finishReason ?? 'no candidates'})`);
        const u = json.usageMetadata;
        return {
          content,
          usage: {
            prompt_tokens: u?.promptTokenCount,
            completion_tokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
            cost: 0, // free tier
          },
        };
      }
      // 429 = free-tier quota, 5xx = busy: back off and retry.
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= retries) {
        throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 500)}`);
      }
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  };
}
