import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-line">
      <table className={cn('w-full border-collapse text-[13px]', className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'border-b border-line bg-surface-2 px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3',
        className
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('border-b border-line-2 px-3 py-3 align-middle', className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('last:[&>td]:border-b-0', className)} {...props} />;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-ink-3">
        {children}
      </td>
    </tr>
  );
}
