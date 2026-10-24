import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { listEnvironments, listProblems } from '@/lib/repo';
import { currentAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // A deleted or reset account still has a validly signed cookie; send it to sign in.
  const account = await currentAccount();
  if (!account) redirect('/login');
  // Signed in with a temporary password from the owner: choose their own first.
  if (account.mustChangePassword) redirect('/set-password');
  const environments = listEnvironments(account.id).map(({ id, name }) => ({ id, name }));
  return (
    <AppShell
      initialProblems={listProblems(account.id)}
      environments={environments}
      account={{ name: account.name, isOwner: account.isOwner }}
    >
      {children}
    </AppShell>
  );
}
