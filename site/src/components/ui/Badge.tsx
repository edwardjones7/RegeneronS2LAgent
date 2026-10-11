import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export type BadgeTone = 'neutral' | 'accent' | 'pass' | 'fail' | 'unknown';

const TONES: Record<BadgeTone, string> = {
  neutral: 'text-ink-2 bg-surface-2 border-line',
  accent: 'text-accent bg-accent-weak border-accent-line',
  pass: 'text-pass bg-pass-bg border-pass/35',
  fail: 'text-fail bg-fail-bg border-fail/35',
  unknown: 'text-unk bg-unk-bg border-unk/35',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] border px-1.5 py-px text-[11px] font-semibold',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
