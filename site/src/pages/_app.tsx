import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import { AppShell, type NavKey, navKeyFor, PAGE_TITLES, PageSkeleton } from '@/components/ui';
import { PipelineWalkthrough } from '@/components/walkthrough/PipelineWalkthrough';

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

/**
 * Signing in (a navigation to ?welcome=1) plays the pipeline walkthrough. It starts on the click, not
 * when the dashboard arrives, and lives here so it stays up while the page underneath changes; it
 * ends by dissolving into the dashboard.
 */
function useWelcome(): [boolean, () => void] {
  const router = useRouter();
  const [welcome, setWelcome] = useState(() => router.query.welcome === '1');
  const close = useCallback(() => setWelcome(false), []);

  useEffect(() => {
    const start = (url: string) => {
      if (new URL(url, 'http://x').searchParams.get('welcome') === '1') setWelcome(true);
    };
    router.events.on('routeChangeStart', start);
    return () => router.events.off('routeChangeStart', start);
  }, [router]);

  return [welcome, close];
}

export default function App({ Component, pageProps }: AppProps) {
  const pending = usePendingPage();
  const [welcome, closeWelcome] = useWelcome();
  return (
    <>
      {pending ? (
        <AppShell title={PAGE_TITLES[pending]} active={pending}>
          <PageSkeleton page={pending} />
        </AppShell>
      ) : (
        <Component {...pageProps} />
      )}
      {welcome && <PipelineWalkthrough onClose={closeWelcome} />}
    </>
  );
}
