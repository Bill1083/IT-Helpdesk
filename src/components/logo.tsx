import { Wrench } from 'lucide-react';

import { cn } from '@/lib/client';

const SIZES = {
  sm: 'size-7 rounded-lg [&>svg]:size-3.5',
  md: 'size-9 rounded-xl [&>svg]:size-4',
  lg: 'size-12 rounded-2xl [&>svg]:size-6',
};

/** The app mark: a wrench on the accent gradient. */
export function Logo({ size = 'sm', className }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm ring-1 ring-inset ring-white/15',
        SIZES[size],
        className,
      )}
    >
      <Wrench strokeWidth={2.25} />
    </div>
  );
}
