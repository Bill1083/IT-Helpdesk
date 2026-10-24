import { redirect } from 'next/navigation';

import { CommandsView } from '@/components/commands-view';
import { listCommands } from '@/lib/repo';
import { currentAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Useful commands · IT Desk' };

export default async function CommandsPage() {
  const account = await currentAccount();
  if (!account) redirect('/login');
  return <CommandsView initial={listCommands(account.id)} />;
}
