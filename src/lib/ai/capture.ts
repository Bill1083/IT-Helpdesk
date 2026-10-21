import { ThinkingLevel, geminiJson } from '@/lib/ai/gemini';
import { extractCodeBlocks, fingerprint, guessPlatform, heuristicDanger } from '@/lib/commands';
import { env } from '@/lib/env';
import { COMMANDS_SCHEMA, commandsPrompt } from '@/lib/prompts';
import * as repo from '@/lib/repo';
import type { CommandPlatform, Message, Problem } from '@/lib/types';

interface AiCommand {
  index: number;
  is_command?: boolean;
  platform?: CommandPlatform;
  shell?: string;
  title?: string;
  what_it_does?: string;
  when_to_use?: string;
  how_used?: string;
  danger?: number;
  danger_notes?: string;
  needs_admin?: boolean;
}

function clean(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function clampDanger(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 1;
}

/**
 * Save every command in an AI reply to the Useful commands library. One fast
 * model call catalogues all the blocks; the pattern-based danger floor means a
 * destructive command is flagged even if that call fails or under-rates it.
 */
export async function captureCommands(problem: Problem, message: Message): Promise<void> {
  const blocks = extractCodeBlocks(message.content);
  if (blocks.length === 0) return;
  const environment = repo.getEnvironment(problem.environmentId);

  let catalogued: AiCommand[] = [];
  if (env.geminiApiKey) {
    try {
      const out = await geminiJson<{ commands?: AiCommand[] }>({
        model: env.geminiFastModel,
        prompt: commandsPrompt(
          { request: problem.description, client: environment?.name ?? null, reply: message.content },
          blocks.map((b, index) => ({ index, ...b })),
        ),
        schema: COMMANDS_SCHEMA,
        thinking: ThinkingLevel.LOW,
        timeoutMs: 30_000,
      });
      catalogued = out.commands ?? [];
    } catch (error) {
      console.error('[it-desk] command cataloguing failed, saving with pattern ratings only:', error instanceof Error ? error.message : error);
    }
  }

  const fallbackContext = `Suggested for "${problem.title ?? problem.description.slice(0, 70)}"`;
  blocks.forEach((block, index) => {
    const meta = catalogued.find((c) => c.index === index);
    if (meta?.is_command === false) return;
    const floor = heuristicDanger(block.code);
    const guessed = guessPlatform(block.code, block.lang);
    const fields: repo.CommandFields = {
      // Trust the model's platform unless it shrugged and the patterns are sure.
      platform: meta?.platform && !(meta.platform === 'other' && guessed !== 'other') ? meta.platform : guessed,
      shell: clean(meta?.shell, 30) ?? (block.lang || null),
      title: clean(meta?.title, 120) ?? block.code.split('\n')[0].slice(0, 80),
      description: clean(meta?.what_it_does, 600),
      whenToUse: clean(meta?.when_to_use, 600),
      danger: Math.max(floor.level, meta ? clampDanger(meta.danger) : 1),
      dangerNotes: clean(meta?.danger_notes, 600) ?? (floor.reasons.join('. ') || null),
      needsAdmin: Boolean(meta?.needs_admin) || floor.needsAdmin,
    };
    const fp = fingerprint(block.code);
    const existing = repo.getCommandIdByFingerprint(fp);
    let id: number;
    if (existing) {
      id = existing;
      if (meta) repo.updateCommand(id, fields);
    } else {
      id = repo.insertCommand(block.code, fp, fields);
    }
    repo.addCommandUse(id, problem.id, message.id, clean(meta?.how_used, 400) ?? fallbackContext);
  });
}
