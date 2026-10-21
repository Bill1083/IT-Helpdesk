/**
 * Runtime configuration. Read lazily so the Docker build never needs secrets.
 */

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readNumber(name: string, fallback: number): number {
  const parsed = Number(read(name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  get appPassword(): string | undefined {
    return read('APP_PASSWORD');
  },
  /** Signing secret for session cookies. Falls back to the password itself. */
  get sessionSecret(): string {
    return `ithd:${read('SESSION_SECRET') ?? ''}:${read('APP_PASSWORD') ?? ''}`;
  },
  get rememberDays(): number {
    return readNumber('REMEMBER_DAYS', 30);
  },
  get dataDir(): string {
    return read('DATA_DIR') ?? './data';
  },

  get geminiApiKey(): string | undefined {
    return read('GEMINI_API_KEY') ?? read('GOOGLE_API_KEY');
  },
  get geminiModel(): string {
    return read('GEMINI_MODEL') ?? 'gemini-3.8-flash';
  },
  get geminiFastModel(): string {
    return read('GEMINI_FAST_MODEL') ?? 'gemini-3.5-flash-lite';
  },
  get geminiResearchModel(): string {
    return read('GEMINI_RESEARCH_MODEL') ?? 'gemini-3.8-flash';
  },
  get geminiEmbeddingModel(): string {
    return read('GEMINI_EMBEDDING_MODEL') ?? 'gemini-embedding-2';
  },

  get anthropicApiKey(): string | undefined {
    return read('ANTHROPIC_API_KEY');
  },
  get anthropicModel(): string {
    return read('ANTHROPIC_MODEL') ?? 'claude-opus-5-5';
  },

  get similarityThreshold(): number {
    const value = readNumber('SIMILARITY_THRESHOLD', 0.72);
    return value < 1 ? value : 0.72;
  },
};
