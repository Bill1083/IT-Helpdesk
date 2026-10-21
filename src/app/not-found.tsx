import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-zinc-500">That problem doesn&apos;t exist, or it was deleted.</p>
      <Link href="/" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
        Back to IT Desk
      </Link>
    </div>
  );
}
