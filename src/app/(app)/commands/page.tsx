import { CommandsView } from '@/components/commands-view';
import { listCommands } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Useful commands · IT Desk' };

export default function CommandsPage() {
  return <CommandsView initial={listCommands()} />;
}
