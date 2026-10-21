import { NewProblem } from '@/components/new-problem';
import { env } from '@/lib/env';
import { getSetting, listEnvironments, reporters } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const environments = listEnvironments().map(({ id, name }) => ({ id, name }));
  const last = getSetting('last_environment');
  const defaultEnvironmentId = environments.find((e) => e.id === last)?.id ?? environments[0]?.id ?? null;
  return (
    <NewProblem
      reporters={reporters()}
      aiReady={Boolean(env.geminiApiKey)}
      environments={environments}
      defaultEnvironmentId={defaultEnvironmentId}
    />
  );
}
