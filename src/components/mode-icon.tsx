import { BookOpen, ListChecks, Scale, Wrench, type LucideIcon } from 'lucide-react';

import type { Mode } from '@/lib/types';

export const MODE_ICONS: Record<Mode, LucideIcon> = {
  fix: Wrench,
  howto: BookOpen,
  plan: ListChecks,
  options: Scale,
};
