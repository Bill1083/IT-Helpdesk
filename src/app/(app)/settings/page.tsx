import { SettingsForm } from '@/components/settings-form';
import { aboutProfile, aiStatus } from '@/lib/ai/engine';
import { env } from '@/lib/env';
import { DEFAULT_ABOUT } from '@/lib/prompts';
import { listEnvironments } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Settings · IT Desk' };

export default function SettingsPage() {
  return (
    <SettingsForm
      about={aboutProfile()}
      defaultAbout={DEFAULT_ABOUT}
      environments={listEnvironments()}
      ai={aiStatus()}
      fastModel={env.geminiFastModel}
      researchModel={env.geminiResearchModel}
      rememberDays={env.rememberDays}
    />
  );
}
