import { cn } from '@/lib/utils/cn';

/** "PHASE2" → 2, "EARLY_PHASE1" → 1; anything else (NA) → null. */
const phaseNumber = (p: string) => (p === 'EARLY_PHASE1' ? 1 : /^PHASE(\d)$/.exec(p) ? Number(p.slice(5)) : null);

function phaseLabel(phases: string[], nums: number[]): string {
  if (!nums.length) return 'N/A';
  if (phases.includes('EARLY_PHASE1') && nums.length === 1) return 'Early 1';
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi ? `${hi}` : `${lo}–${hi}`;
}

const BAR_HEIGHTS = ['h-1/4', 'h-2/4', 'h-3/4', 'h-full'];

/** Phase as a four-step signal: later phases fill more bars. */
export function PhaseBadge({ phases, className }: { phases: string[]; className?: string }) {
  const nums = phases.map(phaseNumber).filter((n): n is number => n !== null);
  const hi = nums.length ? Math.max(...nums) : 0;

  return (
    <span className={cn('flex items-center gap-1.5', className)} aria-label={`Phase ${phaseLabel(phases, nums)}`}>
      <span className="flex h-3 items-end gap-[2px]" aria-hidden>
        {BAR_HEIGHTS.map((height, i) => (
          <span key={height} className={cn('w-[3px] rounded-full', height, i < hi ? 'bg-ink' : 'bg-ink/15')} />
        ))}
      </span>
      <span className="text-[11px] font-semibold text-ink-2">
        Phase <span className="text-ink">{phaseLabel(phases, nums)}</span>
      </span>
    </span>
  );
}
