import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn's class helper: conditional classes, later utilities win. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
