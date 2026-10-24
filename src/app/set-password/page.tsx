import { redirect } from 'next/navigation';

import { SetPasswordForm } from '@/components/set-password-form';
import { currentAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Create your password · IT Desk' };

export default async function SetPasswordPage() {
  const account = await currentAccount();
  if (!account) redirect('/login');
  if (!account.mustChangePassword) redirect('/');
  return <SetPasswordForm name={account.name} />;
}
