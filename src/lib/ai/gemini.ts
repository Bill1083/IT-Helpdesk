import {
  ApiError,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type GroundingMetadata,
} from '@google/genai';

import { env } from '@/lib/env';
import type { Source } from '@/lib/types';

export { ThinkingLevel };

let cached: { key: string; client: GoogleGenAI } | undefined;

function client(): GoogleGenAI {
  const key = env.geminiApiKey;
  if (!key) throw new Error('GEMINI_API_KEY is not set.');
  if (cached?.key !== key) cached = { key, client: new GoogleGenAI({ apiKey: key }) };
  return cached.client;
}

/**
 * Not every model accepts every thinking level. Rather than keep a table of
 * which does what, retry once without thinkingConfig if the API rejects it.
 */
async function withThinkingFallback<T>(config: GenerateContentConfig, run: (c: GenerateContentConfig) => Promise<T>): Promise<T> {
  try {
    return await run(config);
  } catch (error) {
    if (config.thinkingConfig && error instanceof ApiError && error.status === 400 && /thinking/i.test(error.message)) {
      const { thinkingConfig: _dropped, ...rest } = config;
      return run(rest);
    }
    throw error;
  }
}

/** Visible text only: skips thought parts so nothing internal leaks into a step. */
function visibleText(response: GenerateContentResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
}

function fromGrounding(metadata: GroundingMetadata | undefined): { sources: Source[]; queries: string[] } {
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const chunk of metadata?.groundingChunks ?? []) {
    const uri = chunk.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ url: uri, title: chunk.web?.title || chunk.web?.domain || new URL(uri).hostname });
  }
  return { sources, queries: metadata?.webSearchQueries ?? [] };
}

export type GeminiChunk = { type: 'text'; text: string } | { type: 'grounding'; sources: Source[]; queries: string[] };

/**
 * A stalled request to Gemini (or the network path to it) otherwise hangs
 * forever: nothing times out until nginx's own proxy_read_timeout kills the
 * connection out from under it, which the browser then reports as a generic
 * "check your internet connection" rather than anything AI-specific.
 */
const STREAM_TIMEOUT_MS = 120_000;

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function* streamGemini(opts: {
  model: string;
  system: string;
  contents: Content[];
  search: boolean;
  thinking: ThinkingLevel;
  signal?: AbortSignal;
}): AsyncGenerator<GeminiChunk> {
  const config: GenerateContentConfig = {
    systemInstruction: opts.system,
    maxOutputTokens: 16_384,
    thinkingConfig: { thinkingLevel: opts.thinking },
    ...(opts.search ? { tools: [{ googleSearch: {} }] } : {}),
    abortSignal: withTimeout(opts.signal, STREAM_TIMEOUT_MS),
  };
  const stream = await withThinkingFallback(config, (c) =>
    client().models.generateContentStream({ model: opts.model, contents: opts.contents, config: c }),
  );
  let grounding: GroundingMetadata | undefined;
  for await (const chunk of stream) {
    const text = visibleText(chunk);
    if (text) yield { type: 'text', text };
    grounding = chunk.candidates?.[0]?.groundingMetadata ?? grounding;
  }
  if (grounding) yield { type: 'grounding', ...fromGrounding(grounding) };
}

export async function geminiJson<T>(opts: {
  model: string;
  prompt: string;
  schema: unknown;
  thinking: ThinkingLevel;
  timeoutMs: number;
}): Promise<T> {
  const config: GenerateContentConfig = {
    responseMimeType: 'application/json',
    responseJsonSchema: opts.schema,
    maxOutputTokens: 8_192,
    thinkingConfig: { thinkingLevel: opts.thinking },
    abortSignal: AbortSignal.timeout(opts.timeoutMs),
  };
  const response = await withThinkingFallback(config, (c) =>
    client().models.generateContent({ model: opts.model, contents: opts.prompt, config: c }),
  );
  const text = visibleText(response).trim();
  if (!text) throw new Error('Gemini returned an empty response.');
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as T;
}

export async function geminiGrounded(opts: {
  model: string;
  prompt: string;
  thinking: ThinkingLevel;
  timeoutMs: number;
}): Promise<{ text: string; sources: Source[]; queries: string[] }> {
  const config: GenerateContentConfig = {
    tools: [{ googleSearch: {} }],
    maxOutputTokens: 8_192,
    thinkingConfig: { thinkingLevel: opts.thinking },
    abortSignal: AbortSignal.timeout(opts.timeoutMs),
  };
  const response = await withThinkingFallback(config, (c) =>
    client().models.generateContent({ model: opts.model, contents: opts.prompt, config: c }),
  );
  return { text: visibleText(response), ...fromGrounding(response.candidates?.[0]?.groundingMetadata) };
}

export async function geminiText(opts: { model: string; prompt: string; thinking: ThinkingLevel; timeoutMs: number }): Promise<string> {
  const config: GenerateContentConfig = {
    maxOutputTokens: 4_096,
    thinkingConfig: { thinkingLevel: opts.thinking },
    abortSignal: AbortSignal.timeout(opts.timeoutMs),
  };
  const response = await withThinkingFallback(config, (c) =>
    client().models.generateContent({ model: opts.model, contents: opts.prompt, config: c }),
  );
  return visibleText(response).trim();
}

export async function geminiEmbed(text: string): Promise<Float32Array> {
  const response = await client().models.embedContent({
    model: env.geminiEmbeddingModel,
    // gemini-embedding-2 takes the task in the text rather than a taskType field.
    contents: `task: sentence similarity | query: ${text.slice(0, 8000)}`,
    config: { outputDimensionality: 768, abortSignal: AbortSignal.timeout(8000) },
  });
  const values = response.embeddings?.[0]?.values;
  if (!values?.length) throw new Error('Gemini returned no embedding.');
  return Float32Array.from(values);
}
