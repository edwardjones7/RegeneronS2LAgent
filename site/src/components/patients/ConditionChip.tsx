import { AREA_STYLES } from '@/components/trials/areaStyles';
import { classifyTrial } from '@/lib/trials/areas';
import { cn } from '@/lib/utils/cn';

/** A condition with a dot in the color of its therapeutic area, matching the trial cards. */
export function ConditionChip({ name, muted = false }: { name: string; muted?: boolean }) {
  const area = classifyTrial([name], []);
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-medium',
        muted ? 'text-ink-3' : 'text-ink-2'
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', muted ? 'bg-ink-3/50' : AREA_STYLES[area].dot)} />
      <span className="truncate">{name}</span>
    </span>
  );
}
