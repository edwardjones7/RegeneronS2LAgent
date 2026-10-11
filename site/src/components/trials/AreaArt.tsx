import type { ReactNode } from 'react';
import type { TherapeuticArea } from '@/lib/trials/areas';
import { cn } from '@/lib/utils/cn';

/** Line drawings per therapeutic area, on a 200×200 canvas. Drawn in currentColor. */
const ART: Record<TherapeuticArea, ReactNode> = {
  'solid-tumors': (
    <>
      <path d="M60 70c10-30 50-38 72-20 24 4 40 30 30 54 8 26-14 52-42 50-20 16-52 8-60-14-22-10-24-44 0-70z" />
      <circle cx="88" cy="88" r="11" />
      <circle cx="122" cy="80" r="7" />
      <circle cx="112" cy="120" r="14" />
      <circle cx="112" cy="120" r="5" />
      <circle cx="78" cy="124" r="6" />
      <circle cx="140" cy="108" r="4" />
      <path d="M60 70L42 54M162 104l22 4M124 154l6 22M40 122l-22 8M132 50l10-20" />
    </>
  ),
  'blood-cancers': (
    <>
      <path d="M100 16c-30 44-58 78-58 110a58 58 0 00116 0c0-32-28-66-58-110z" />
      <ellipse cx="82" cy="132" rx="18" ry="11" />
      <ellipse cx="82" cy="132" rx="7" ry="4" />
      <circle cx="120" cy="110" r="13" />
      <circle cx="120" cy="110" r="5" />
      <ellipse cx="118" cy="152" rx="12" ry="8" />
      <circle cx="90" cy="96" r="4" />
      <circle cx="140" cy="140" r="3" />
    </>
  ),
  immunology: (
    <>
      <path d="M90 186v-70L48 72l12-12 40 42 40-42 12 12-42 44v70z" />
      <path d="M100 186v-60M68 78l26 28M132 78l-26 28" />
      <circle cx="42" cy="52" r="10" />
      <circle cx="158" cy="52" r="10" />
      <path d="M36 36l-6-8M52 38l4-9M164 36l6-8M148 38l-4-9" />
    </>
  ),
  respiratory: (
    <>
      <path d="M100 14v62" />
      <path d="M94 24h12M94 36h12M94 48h12M94 60h12" />
      <path d="M100 76c-8 7-16 11-26 13M100 76c8 7 16 11 26 13" />
      <path d="M88 60C70 50 52 62 42 88c-12 32-16 66-8 86 6 14 22 14 36 4 14-10 20-30 20-56V78" />
      <path d="M112 60c18-10 36 2 46 28 12 32 16 66 8 86-6 14-22 14-36 4-14-10-20-30-20-56V78" />
      <path d="M74 89c-8 10-12 24-14 38M74 89c2 14 0 30-6 42M126 89c8 10 12 24 14 38M126 89c-2 14 0 30 6 42" />
    </>
  ),
  cardiovascular: (
    <>
      <path d="M100 176C55 146 28 116 28 82a36 36 0 0172-12 36 36 0 0172 12c0 34-27 64-72 94z" />
      <path d="M86 56V36c0-10 8-16 18-16h10c10 0 16 8 16 18v18" />
      <path d="M104 20V6M120 22l5-14" />
      <path d="M44 104h30l8-18 12 36 10-30 8 12h44" />
    </>
  ),
  // Shifted right so the kidney's outline isn't lost off the card's left edge.
  metabolic: (
    <g transform="translate(36 0)">
      <path d="M72 28c-34 0-52 36-48 74 4 42 26 72 60 68 22-3 26-22 20-38-6-16-4-28 8-36 12-8 14-26 6-42-8-16-24-26-46-26z" />
      <path d="M106 94c10-2 18 2 24 8M106 110c10 2 18 0 24-6" />
      <path d="M130 102c14 14 18 42 14 84" />
      <path d="M58 68c10 4 20 12 30 22M54 132c12-4 24-12 34-22M46 100h42" />
    </g>
  ),
  eye: (
    <>
      <path d="M12 100C44 54 156 54 188 100 156 146 44 146 12 100z" />
      <circle cx="100" cy="100" r="31" />
      <circle cx="100" cy="100" r="12" />
      <path d="M113 89a15 15 0 017 9" />
      <path d="M40 74l-9-13M62 62l-5-15M100 56V39M138 62l5-15M160 74l9-13" />
    </>
  ),
  neurology: (
    <>
      <path d="M60 150c-30-4-44-30-36-56-10-24 6-50 32-54 10-22 40-28 58-14 22-10 48 0 56 22 22 6 32 32 22 52 10 22-6 46-30 48-8 16-28 22-44 14-12 10-36 8-44-6z" />
      <path d="M118 158c4 12 4 22 0 34" />
      <path d="M56 60c10 4 14 14 10 24M90 44c-4 12 2 24 14 28M128 46c-2 14 6 24 20 26M40 100c14-2 26 6 30 18M80 96c10-8 26-6 34 4M130 92c8 10 22 12 32 6M74 132c6-10 18-14 30-10M120 128c10 6 22 6 30-2" />
    </>
  ),
  other: (
    <>
      <circle cx="100" cy="70" r="34" />
      <path d="M28 192c4-46 34-72 72-72s68 26 72 72" />
      <circle cx="86" cy="72" r="9" />
      <circle cx="114" cy="72" r="9" />
      <path d="M95 72h10M66 68h11M123 68h11M90 90c6 5 14 5 20 0" />
      <path d="M72 46c8-10 20-14 28-14s20 4 28 14" />
    </>
  ),
};

/**
 * Large white outline for a trial's area, set high and left so the card edge crops it.
 * Place inside a `relative overflow-hidden` card, before the content.
 */
export function AreaArt({ area, className }: { area: TherapeuticArea; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        'pointer-events-none absolute -left-10 -top-6 size-72 -rotate-6 text-white/80 [mask-image:linear-gradient(to_bottom,black_35%,transparent_85%)]',
        className
      )}
    >
      {ART[area]}
    </svg>
  );
}
