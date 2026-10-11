import type { TherapeuticArea } from '@/lib/trials/areas';

/** Soft gradient per therapeutic area. Full class strings so Tailwind picks them up. */
export const AREA_STYLES: Record<TherapeuticArea, { gradient: string; dot: string }> = {
  'solid-tumors': { gradient: 'from-[#FF9F80] via-[#FFC2A6] to-[#FFE3D1]', dot: 'bg-[#F5845F]' },
  'blood-cancers': { gradient: 'from-[#F08DB4] via-[#F7B6CF] to-[#FCDDE8]', dot: 'bg-[#E46E9E]' },
  immunology: { gradient: 'from-[#F6BE5E] via-[#FAD691] to-[#FDEBC7]', dot: 'bg-[#E5A63A]' },
  respiratory: { gradient: 'from-[#78B4F4] via-[#A3CEF6] to-[#D4E9FB]', dot: 'bg-[#4F98E6]' },
  cardiovascular: { gradient: 'from-[#EC7B7F] via-[#F4A7A6] to-[#FAD2CE]', dot: 'bg-[#DE5A60]' },
  metabolic: { gradient: 'from-[#93CF7C] via-[#BCE2A6] to-[#E0F2D3]', dot: 'bg-[#6DB553]' },
  eye: { gradient: 'from-[#5EC6B6] via-[#96DCCF] to-[#CDEFE8]', dot: 'bg-[#38AE9C]' },
  neurology: { gradient: 'from-[#8EA6EE] via-[#B4C5F4] to-[#DAE3FA]', dot: 'bg-[#6E8AE3]' },
  other: { gradient: 'from-[#A9B4C2] via-[#C7CFD9] to-[#E4E8EE]', dot: 'bg-[#8D99A8]' },
};
