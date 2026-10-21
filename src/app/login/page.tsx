import { LoginForm } from '@/components/login-form';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in · IT Desk' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only ever bounce back to a path on this site.
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return <LoginForm next={target} rememberDays={env.rememberDays} configured={Boolean(env.appPassword)} />;
}
