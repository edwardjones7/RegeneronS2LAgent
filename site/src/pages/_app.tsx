import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { AppShell, type NavKey, navKeyFor, PAGE_TITLES, PageSkeleton } from '@/components/ui';

/**
 * Pages load their data on the server, so a page switch would otherwise sit on the old page until it
 * arrives. Instead the new page's skeleton shows at once. Shallow changes (a drawer or modal opening)
 * and changes within the same page (filters) keep the current page as it is.
 */
function usePendingPage(): NavKey | null {
  const router = useRouter();
  const [pending, setPending] = useState<NavKey | null>(null);

  useEffect(() => {
    const start = (url: string, { shallow }: { shallow: boolean }) => {
      const target = navKeyFor(url);
      if (shallow || !target || target === navKeyFor(router.asPath)) return;
      setPending(target);
    };
    const done = () => setPending(null);
    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', done);
    router.events.on('routeChangeError', done);
    return () => {
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeComplete', done);
      router.events.off('routeChangeError', done);
    };
  }, [router]);

  return pending;
}

export default function App({ Component, pageProps }: AppProps) {
  const pending = usePendingPage();
  if (pending) {
    return (
      <AppShell title={PAGE_TITLES[pending]} active={pending}>
        <PageSkeleton page={pending} />
      </AppShell>
    );
  }
  return <Component {...pageProps} />;
}
