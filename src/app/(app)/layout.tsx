import { AppShell } from '@/components/app-shell';
import { listEnvironments, listProblems } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const environments = listEnvironments().map(({ id, name }) => ({ id, name }));
  return (
    <AppShell initialProblems={listProblems()} environments={environments}>
      {children}
    </AppShell>
  );
}
