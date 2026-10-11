import Head from 'next/head';

export default function Home() {
  return (
    <>
      <Head>
        <title>Trial pre-screening</title>
      </Head>
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-3 px-6">
        <h1 className="text-2xl font-semibold text-slate-900">Trial pre-screening</h1>
        <p className="text-slate-600">
          Next.js + Supabase scaffold. Check the backend connection at{' '}
          <code className="font-mono text-sm">/api/health</code>.
        </p>
      </main>
    </>
  );
}
