import { redirect } from 'next/navigation';

import { SettingsForm } from '@/components/settings-form';
import { aboutProfile, aiStatus } from '@/lib/ai/engine';
import { backupStatus } from '@/lib/backup';
import { env } from '@/lib/env';
import { DEFAULT_ABOUT } from '@/lib/prompts';
import { listAccounts, listEnvironments } from '@/lib/repo';
import { currentAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Settings · IT Desk' };

export default async function SettingsPage() {
  const account = await currentAccount();
  if (!account) redirect('/login');
  return (
    <SettingsForm
      account={{ name: account.name, isOwner: account.isOwner }}
      about={aboutProfile(account.id)}
      defaultAbout={DEFAULT_ABOUT}
      environments={listEnvironments(account.id)}
      ai={aiStatus()}
      fastModel={env.geminiFastModel}
      researchModel={env.geminiResearchModel}
      rememberDays={env.rememberDays}
      // Backups and accounts are server-wide, so only the owner manages them.
      backup={account.isOwner ? backupStatus() : null}
      backupKeepDays={env.backupKeepDays}
      accounts={account.isOwner ? listAccounts() : null}
    />
  );
}
