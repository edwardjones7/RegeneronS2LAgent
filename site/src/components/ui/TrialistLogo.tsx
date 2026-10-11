import { useId } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The Trialist mark: two rings for a trial and a practice's patients, with their overlap, the
 * match, in green. Ink tile like the app's buttons; ring colors from the area palette.
 */
export function TrialistMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('shrink-0', className)}>
      <defs>
        <linearGradient id={`${id}tile`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2A3242" />
          <stop offset="1" stopColor="#1E2430" />
        </linearGradient>
        <linearGradient id={`${id}match`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9BDDB0" />
          <stop offset="1" stopColor="#5FC08A" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}tile)`} />
      <path d="M16 9.94A7 7 0 0116 22.06 7 7 0 0116 9.94z" fill={`url(#${id}match)`} />
      <circle cx="12.5" cy="16" r="7" fill="none" stroke="#FFC2A6" strokeWidth={2} />
      <circle cx="19.5" cy="16" r="7" fill="none" stroke="#A3CEF6" strokeWidth={2} />
    </svg>
  );
}

/** Trialist logo: the mark + wordmark outlined from Geist SemiBold (source: images/trialist/). Ink follows text color. */
export function TrialistLogo({ className }: { className?: string }) {
  return (
    <span role="img" aria-label="Trialist" className={cn('inline-flex select-none items-center gap-2', className)}>
      <TrialistMark className="size-[22px]" />
      <svg viewBox="45 -730 2945 752" aria-hidden className="h-[15px] w-auto shrink-0">
        <path
          d="M284 0Q204 0 166.5 -37.0Q129 -74 129 -153V-659H257V-165Q257 -128 273.0 -113.5Q289 -99 323 -99H398V0ZM45 -435V-534H398V-435ZM482 0V-534H602L607 -386L596 -388Q608 -465 641.5 -499.5Q675 -534 733 -534H782V-424H732Q691 -424 664.0 -412.0Q637 -400 623.5 -374.5Q610 -349 610 -308V0ZM845 0V-534H973V0ZM843 -605V-719H976V-605ZM1239 12Q1155 12 1104.0 -26.5Q1053 -65 1053 -134Q1053 -203 1096.0 -242.0Q1139 -281 1227 -298L1404 -333Q1404 -390 1378.0 -418.5Q1352 -447 1301 -447Q1255 -447 1228.5 -425.5Q1202 -404 1192 -364L1062 -370Q1078 -455 1140.0 -500.5Q1202 -546 1301 -546Q1415 -546 1473.5 -488.5Q1532 -431 1532 -324V-130Q1532 -109 1539.5 -101.0Q1547 -93 1562 -93H1579V0Q1573 2 1559.5 3.0Q1546 4 1532 4Q1499 4 1473.0 -6.5Q1447 -17 1433.0 -43.5Q1419 -70 1419 -116L1430 -108Q1422 -73 1395.5 -45.5Q1369 -18 1329.0 -3.0Q1289 12 1239 12ZM1265 -81Q1308 -81 1339.0 -98.0Q1370 -115 1387.0 -145.0Q1404 -175 1404 -216V-246L1266 -218Q1223 -209 1204.5 -191.5Q1186 -174 1186 -146Q1186 -115 1206.5 -98.0Q1227 -81 1265 -81ZM1762 0Q1704 0 1669.0 -30.0Q1634 -60 1634 -126V-710H1762V-139Q1762 -119 1772.5 -109.0Q1783 -99 1802 -99H1841V0ZM1903 0V-534H2031V0ZM1901 -605V-719H2034V-605ZM2359 12Q2280 12 2226.5 -11.0Q2173 -34 2144.0 -75.0Q2115 -116 2111 -168L2242 -174Q2249 -132 2277.0 -109.0Q2305 -86 2360 -86Q2405 -86 2430.5 -100.5Q2456 -115 2456 -146Q2456 -164 2447.0 -176.0Q2438 -188 2413.0 -197.0Q2388 -206 2339 -215Q2257 -229 2210.0 -249.5Q2163 -270 2143.5 -301.0Q2124 -332 2124 -378Q2124 -453 2181.5 -499.5Q2239 -546 2350 -546Q2422 -546 2471.0 -522.5Q2520 -499 2547.5 -458.5Q2575 -418 2582 -366L2453 -360Q2448 -387 2435.0 -407.0Q2422 -427 2400.0 -437.5Q2378 -448 2348 -448Q2303 -448 2280.0 -430.0Q2257 -412 2257 -382Q2257 -361 2267.5 -347.0Q2278 -333 2302.0 -324.5Q2326 -316 2366 -309Q2450 -296 2498.5 -275.5Q2547 -255 2567.5 -223.5Q2588 -192 2588 -148Q2588 -97 2559.5 -61.0Q2531 -25 2479.5 -6.5Q2428 12 2359 12ZM2864 0Q2784 0 2746.5 -37.0Q2709 -74 2709 -153V-659H2837V-165Q2837 -128 2853.0 -113.5Q2869 -99 2903 -99H2978V0ZM2625 -435V-534H2978V-435Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
