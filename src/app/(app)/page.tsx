import { redirect } from 'next/navigation';

import { NewProblem } from '@/components/new-problem';
import { env } from '@/lib/env';
import { getAccountSetting, listEnvironments, listProblems, reporters } from '@/lib/repo';
import { currentAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const account = await currentAccount();
  if (!account) redirect('/login');
  const environments = listEnvironments(account.id).map(({ id, name }) => ({ id, name }));
  const last = getAccountSetting(account.id, 'last_environment');
  const defaultEnvironmentId = environments.find((e) => e.id === last)?.id ?? environments[0]?.id ?? null;
  return (
    <NewProblem
      reporters={reporters(account.id)}
      aiReady={Boolean(env.geminiApiKey)}
      environments={environments}
      defaultEnvironmentId={defaultEnvironmentId}
      recentOpen={listProblems(account.id, { limit: 50 })
        .filter((p) => p.status === 'open')
        .slice(0, 3)}
    />
  );
}
