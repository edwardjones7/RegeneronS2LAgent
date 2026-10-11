import type { ReactNode } from 'react';
import type { TherapeuticArea } from '@/lib/trials/areas';
import { cn } from '@/lib/utils/cn';

/** Line drawings per therapeutic area, on a 200×200 canvas. Drawn in currentColor. */
export const AREA_ART: Record<TherapeuticArea, ReactNode> = {
  'solid-tumors': (
    // Scaled up about the center so it carries the same weight as the other drawings.
    <g transform="translate(-26 -26) scale(1.25)" strokeWidth={1.28}>
      {/* A lumpy mass of cells. */}
      <path d="M60 72a26 26 0 0144-14 24 24 0 0140 10 24 24 0 0114 40 26 26 0 01-18 42 24 24 0 01-42 6 26 26 0 01-40-24 24 24 0 012-60z" />
      <circle cx="86" cy="94" r="12" />
      <circle cx="120" cy="88" r="7" />
      <circle cx="114" cy="122" r="14" />
      <circle cx="80" cy="128" r="6" />
    </g>
  ),
  'blood-cancers': (
    <>
      {/* A drop, with a highlight and two red cells. */}
      <path d="M100 18C82 46 46 86 46 124a54 54 0 00108 0c0-38-36-78-54-106z" />
      <path d="M64 120c0-14 6-28 16-40" />
      <ellipse cx="96" cy="134" rx="22" ry="13" />
      <ellipse cx="96" cy="134" rx="9" ry="4.5" />
      <circle cx="126" cy="110" r="9" />
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
      {/* A symmetric heart, a highlight, and a heartbeat across it. */}
      <path d="M100 170C60 142 28 112 28 78c0-26 20-44 42-44 14 0 24 8 30 18 6-10 16-18 30-18 22 0 42 18 42 44 0 34-32 64-72 92z" />
      <path d="M46 78c0-12 8-22 20-24" />
      <path d="M48 104h30l9-20 13 40 10-30 7 10h35" />
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
      {/* Almond eye: two lids, a crease above, iris, pupil, one glint. */}
      <path d="M20 100Q100 30 180 100Q100 170 20 100z" />
      <path d="M44 74Q100 30 156 74" />
      <circle cx="100" cy="100" r="28" />
      <circle cx="100" cy="100" r="11" />
      <path d="M110 86a16 16 0 017 8" />
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
      {/* A person: head and shoulders, nothing more. */}
      <circle cx="100" cy="70" r="30" />
      <path d="M40 186c0-42 26-66 60-66s60 24 60 66" />
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
      {AREA_ART[area]}
    </svg>
  );
}
