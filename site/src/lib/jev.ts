// Jev client: TypeSafe's System One decision model through OpenRouter.
//
// Emits: a de-identified `state` (see engine/state.ts) and the questions.
// No names, IDs or exact dates cross this boundary.

const ENDPOINT = 'https://openrouter.ai/api/v1/systemone';
export const JEV_MODEL = 'typesafe/jev-1.13';

export type JevAnswer = {
  type: string;
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
  noul?: number;
};

export type JevResponse = {
  answers: Record<string, JevAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
};

export async function askJev(
  apiKey: string,
  state: unknown,
  questions: Record<string, unknown>,
  { model = JEV_MODEL, retries = 3 }: { model?: string; retries?: number } = {},
): Promise<JevResponse> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, state, questions }),
    });
    if (res.ok) return (await res.json()) as JevResponse;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}
