import { cn } from '@/lib/utils/cn';

/** Soft two-tone fills, picked per patient so the list isn't a wall of one color. */
const FILLS = [
  'from-[#FFC2A6] to-[#FFE3D1]',
  'from-[#A3CEF6] to-[#D4E9FB]',
  'from-[#BCE2A6] to-[#E0F2D3]',
  'from-[#F7B6CF] to-[#FCDDE8]',
  'from-[#96DCCF] to-[#CDEFE8]',
  'from-[#FAD691] to-[#FDEBC7]',
  'from-[#B4C5F4] to-[#DAE3FA]',
];

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function PatientAvatar({ id, name, size = 'md' }: { id: string; name: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-linear-to-br font-semibold text-ink/80',
        FILLS[hash(id) % FILLS.length],
        size === 'lg' ? 'size-12 text-[15px]' : 'size-9 text-[12px]'
      )}
    >
      {initials(name)}
    </span>
  );
}
