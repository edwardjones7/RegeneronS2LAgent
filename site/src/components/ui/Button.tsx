import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';

type Variant = 'primary' | 'secondary';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white border-accent hover:bg-accent-hover',
  secondary: 'bg-surface text-ink border-line hover:border-ink-3',
};

const BASE = 'inline-flex items-center justify-center gap-1.5 rounded-[7px] border px-3.5 py-2 text-[12.5px] font-semibold';

export function Button({ variant = 'primary', className, ...props }: ComponentProps<'button'> & { variant?: Variant }) {
  return <button className={cn(BASE, VARIANTS[variant], className)} {...props} />;
}

export function LinkButton({ variant = 'primary', className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(BASE, VARIANTS[variant], className)} {...props} />;
}
