import Anthropic from '@anthropic-ai/sdk';

import { env } from '@/lib/env';
import type { Source } from '@/lib/types';

let cached: { key: string; client: Anthropic } | undefined;

function client(): Anthropic {
  const key = env.anthropicApiKey;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');
  if (cached?.key !== key) cached = { key, client: new Anthropic({ apiKey: key }) };
  return cached.client;
}

export type ClaudeChunk =
  | { type: 'text'; text: string }
  | { type: 'status'; text: string }
  | { type: 'sources'; items: Source[] };

/** Server-side web search can pause a long turn; resume it this many times at most. */
const MAX_CONTINUATIONS = 3;

/**
 * The Anthropic SDK's own default (10 minutes) is longer than nginx's own
 * proxy timeout for this endpoint (300s) - better to fail fast with an
 * honest "took too long" than have the connection cut from underneath it.
 * One budget for the whole call, not per round: "Think harder" can run
 * several search rounds, and re-arming it each round could add up to more
 * than nginx's own cutoff, which is worse than having no timeout at all.
 */
const STREAM_TIMEOUT_MS = 240_000;

/**
 * "Think harder": Claude with adaptive thinking at high effort plus server-side
 * web search. Refusals fall back to Anthropic's recommended model server-side.
 */
export async function* streamClaude(opts: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  signal?: AbortSignal;
}): AsyncGenerator<ClaudeChunk> {
  const messages = [...opts.messages];
  const timeout = AbortSignal.timeout(STREAM_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  for (let round = 0; round <= MAX_CONTINUATIONS; round += 1) {
    const stream = client().beta.messages.stream(
      {
        model: env.anthropicModel,
        max_tokens: 32_000,
        system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
        messages,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
        output_config: { effort: 'high' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block.type === 'server_tool_use') {
          yield { type: 'status', text: 'Claude is searching the web…' };
        } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          // A list means results; an error arrives as a single object instead.
          const items = block.content
            .filter((r) => r.type === 'web_search_result')
            .map((r) => ({ title: r.title, url: r.url }));
          if (items.length) yield { type: 'sources', items };
        }
      } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: final.content });
      continue;
    }
    if (final.stop_reason === 'refusal') {
      throw new Error('Claude declined this request. Try the step again with Gemini.');
    }
    return;
  }
}
