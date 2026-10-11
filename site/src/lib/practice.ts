/**
 * The practice the demo is signed in as. Placeholder until there's real doctor data:
 * one Synthea county stands in for one practice's patient panel.
 */
export const DEMO_PRACTICE = {
  doctor: 'Dr. Rivera',
  name: 'New Brunswick Family Medicine',
  county: 'Middlesex County',
} as const;

/** "Good morning" / "Good afternoon" / "Good evening" for the practice's local time. */
export function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }).format(now));
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}
