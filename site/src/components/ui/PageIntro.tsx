import type { ReactNode } from 'react';
import { DEMO_PRACTICE } from '@/lib/practice';

interface PageIntroProps {
  title: string;
  description: ReactNode;
  /** Right of the title, e.g. a button. */
  actions?: ReactNode;
  /** Under the description, e.g. <Tabs />. */
  tabs?: ReactNode;
}

/** The page header used across the doctor app: practice line, large title, one plain sentence. */
export function PageIntro({ title, description, actions, tabs }: PageIntroProps) {
  return (
    <header>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink-2">{DEMO_PRACTICE.name}</p>
          <h1 className="mt-1 text-[34px] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-2">{description}</p>
        </div>
        {actions && <div className="flex shrink-0 gap-2 pt-6">{actions}</div>}
      </div>
      {tabs && <div className="mt-6">{tabs}</div>}
    </header>
  );
}
