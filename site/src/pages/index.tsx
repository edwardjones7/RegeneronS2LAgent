import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/trials', permanent: false },
});

export default function Home() {
  return null;
}
