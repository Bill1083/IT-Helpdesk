import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { Thread } from '@/components/thread';
import { env } from '@/lib/env';
import { PLAYBOOKS } from '@/lib/playbooks';
import { getOwnedProblem, listEnvironments } from '@/lib/repo';
import { currentAccount } from '@/lib/session';
import { problemView } from '@/lib/views';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> };

const CATEGORY_LABELS = Object.fromEntries(PLAYBOOKS.map((p) => [p.key, p.label]));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const account = await currentAccount();
  const problem = account ? getOwnedProblem((await params).id, account.id) : null;
  return { title: problem ? `${problem.title || 'Chat'} · IT Desk` : 'IT Desk' };
}

export default async function ProblemPage({ params, searchParams }: Props) {
  const account = await currentAccount();
  if (!account) redirect('/login');
  const [{ id }, query] = await Promise.all([params, searchParams]);
  // Another account's chat looks exactly like one that doesn't exist.
  const view = problemView(id, account.id);
  if (!view) notFound();
  return (
    <Thread
      key={id}
      initial={view}
      ai={{ gemini: Boolean(env.geminiApiKey), claude: Boolean(env.anthropicApiKey) }}
      categoryLabels={CATEGORY_LABELS}
      environments={listEnvironments(account.id).map(({ id: envId, name }) => ({ id: envId, name }))}
      autoStart={query.new === '1'}
    />
  );
}
