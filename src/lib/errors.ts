/**
 * Turns raw error text into a plain-language title and a "what to check" hint.
 * The raw text is always kept for debugging. Pure module: used by the server
 * (connection checks) and the browser (error notices).
 */

export type ErrorContext = 'backup' | 'ai' | 'upload' | 'general';

export interface ErrorHelp {
  title: string;
  hint: string;
  /** Short code for searching logs, e.g. EPROTO, 429, NoSuchBucket. */
  code: string | null;
}

interface Rule {
  test: RegExp;
  contexts?: ErrorContext[];
  title: string;
  hint: string;
}

const RULES: Rule[] = [
  // --- Backups (Cloudflare R2) -------------------------------------------
  {
    test: /alert number 40|handshake failure|EPROTO|wrong version number|certificate|altnames/i,
    contexts: ['backup'],
    title: "Couldn't open a secure connection to R2",
    hint: "Cloudflare refuses the connection like this when the account ID in the address isn't a real R2 account, so R2_ACCOUNT_ID is almost certainly the wrong value. Use the Account ID shown on the R2 overview page (it's also the long code in the dashboard URL, dash.cloudflare.com/<account-id>/…). It is not the Access Key ID or a Zone ID, though all three look alike. If the bucket uses an EU jurisdiction, also set R2_ENDPOINT=https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com.",
  },
  {
    test: /ENOTFOUND|EAI_AGAIN|getaddrinfo/i,
    contexts: ['backup'],
    title: "Couldn't find the R2 server",
    hint: "The address didn't resolve. Check R2_ACCOUNT_ID for typos. If it's correct, the VPS may have a DNS or internet problem; try `curl -I https://cloudflare.com` on the server.",
  },
  {
    test: /InvalidAccessKeyId|access key id .* does not exist|Unauthorized|\b401\b/i,
    contexts: ['backup'],
    title: "R2 didn't recognise the access key",
    hint: 'Check R2_ACCESS_KEY_ID is the "Access Key ID" from the R2 API token page (not the token value), and that the token has not been deleted. Restart the container after changing .env.',
  },
  {
    test: /SignatureDoesNotMatch/i,
    contexts: ['backup'],
    title: 'R2 rejected the secret key',
    hint: 'R2_SECRET_ACCESS_KEY is wrong or has extra characters. It is only shown once when the token is created; if you no longer have it, create a new R2 API token and update both keys in .env.',
  },
  {
    test: /AccessDenied|Forbidden|\b403\b/i,
    contexts: ['backup'],
    title: "The R2 token isn't allowed to use this bucket",
    hint: 'Edit the R2 API token: permission must be "Object Read & Write", applied to the bucket named in R2_BUCKET. If you set Client IP filtering, it must include every public IP the VPS uses. Check them with `curl -4 ifconfig.me` and `curl -6 ifconfig.me`, and add the IPv6 address too if the second one answers.',
  },
  {
    test: /NoSuchBucket|specified bucket does not exist/i,
    contexts: ['backup'],
    title: "That bucket doesn't exist",
    hint: 'R2_BUCKET must exactly match the bucket name in Cloudflare (lowercase). If the bucket uses an EU jurisdiction, set R2_ENDPOINT=https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com.',
  },
  {
    test: /not configured/i,
    contexts: ['backup'],
    title: 'Backups are not set up',
    hint: 'Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET to the server .env, then run `docker compose up -d`.',
  },
  {
    test: /InternalError|internal error/i,
    contexts: ['backup'],
    title: 'R2 had a temporary problem',
    hint: "This is on Cloudflare's side. Wait a few minutes and try again; the nightly backup retries automatically.",
  },

  // --- AI providers --------------------------------------------------------
  {
    test: /API key not valid|API_KEY_INVALID|invalid x-api-key|authentication_error|invalid api key|\b401\b/i,
    contexts: ['ai'],
    title: 'The AI key was rejected',
    hint: 'Check GEMINI_API_KEY (or ANTHROPIC_API_KEY for Think harder) in the server .env, then run `docker compose up -d`.',
  },
  {
    test: /credit balance|billing|payment required|\b402\b/i,
    contexts: ['ai'],
    title: 'The AI account is out of credit',
    hint: 'Top up or enable billing for that provider (Google AI Studio or console.anthropic.com).',
  },
  {
    test: /\b429\b|RESOURCE_EXHAUSTED|rate limit|quota/i,
    contexts: ['ai'],
    title: 'Too many requests for now',
    hint: "You've hit the provider's rate limit or quota. Wait a minute and retry; if it keeps happening, check your plan's limits.",
  },
  {
    test: /PERMISSION_DENIED|\b403\b/i,
    contexts: ['ai'],
    title: "The AI key can't use this model",
    hint: 'The key is valid but lacks access. Check the Gemini API is enabled for the key\'s project, or pick another model in .env.',
  },
  {
    test: /\b404\b|NOT_FOUND|is not found|not supported for|model.*(not exist|retired)/i,
    contexts: ['ai'],
    title: "That AI model isn't available",
    hint: 'The model may have been renamed or retired. Set GEMINI_MODEL / GEMINI_FAST_MODEL (or ANTHROPIC_MODEL) in .env to a current model.',
  },
  {
    test: /\b50[0-4]\b|\b529\b|UNAVAILABLE|overloaded|INTERNAL/i,
    contexts: ['ai'],
    title: 'The AI service is busy',
    hint: "A temporary problem at the provider. Retry in a moment, or use Think harder to try the other AI.",
  },
  {
    test: /took too long|timeout|TimeoutError|aborted/i,
    contexts: ['ai'],
    title: 'The AI took too long',
    hint: 'Retry. If it keeps timing out, turn off Web search for that message.',
  },
  {
    test: /empty reply|empty response|SAFETY|blocked/i,
    contexts: ['ai'],
    title: 'The AI returned nothing',
    hint: 'Usually a content filter. Rephrase the message (for example, describe the error instead of pasting a large log) and retry.',
  },
  {
    test: /declined/i,
    contexts: ['ai'],
    title: 'Claude declined this one',
    hint: 'Use "Try another way" to answer it with Gemini instead.',
  },

  // --- Anywhere ------------------------------------------------------------
  {
    test: /Failed to fetch|NetworkError|Load failed|network error/i,
    title: "Can't reach IT Desk",
    hint: 'Check your internet connection. If other sites work, the server may be restarting; try again in a minute.',
  },
  {
    test: /Not signed in/i,
    title: 'You were signed out',
    hint: 'Sign in again; tick "Remember me" to stay signed in.',
  },
];

const CODE = /\b(E[A-Z]{4,}|alert number \d+|[A-Z][a-z]+(?:[A-Z][a-z]+)+|[A-Z]{4,}_[A-Z_]+|[1-5]\d\d)\b/;

export function explainError(raw: string, context: ErrorContext = 'general'): ErrorHelp {
  const rule = RULES.find((r) => (!r.contexts || r.contexts.includes(context)) && r.test.test(raw));
  const code = raw.match(CODE)?.[1] ?? null;
  if (rule) return { title: rule.title, hint: rule.hint, code };
  return {
    title: 'Something went wrong',
    hint: 'Try again. If it keeps happening, copy the details and check the server log with `docker compose logs app`.',
    code,
  };
}
