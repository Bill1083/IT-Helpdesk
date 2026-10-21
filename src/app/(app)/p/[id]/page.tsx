import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Thread } from '@/components/thread';
import { env } from '@/lib/env';
import { PLAYBOOKS } from '@/lib/playbooks';
import { listEnvironments } from '@/lib/repo';
import { problemView } from '@/lib/views';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> };

const CATEGORY_LABELS = Object.fromEntries(PLAYBOOKS.map((p) => [p.key, p.label]));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const view = problemView((await params).id);
  return { title: view ? `${view.problem.title || 'Chat'} · IT Desk` : 'IT Desk' };
}

export default async function ProblemPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const view = problemView(id);
  if (!view) notFound();
  return (
    <Thread
      key={id}
      initial={view}
      ai={{ gemini: Boolean(env.geminiApiKey), claude: Boolean(env.anthropicApiKey) }}
      categoryLabels={CATEGORY_LABELS}
      environments={listEnvironments().map(({ id: envId, name }) => ({ id: envId, name }))}
      autoStart={query.new === '1'}
    />
  );
}
