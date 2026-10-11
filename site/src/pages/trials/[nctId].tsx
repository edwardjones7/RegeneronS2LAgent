import type { GetServerSideProps } from 'next';

/** Old trial links open the trial in the modal on /trials. */
export const getServerSideProps: GetServerSideProps = async ({ params }) => ({
  redirect: { destination: `/trials?trial=${encodeURIComponent(String(params?.nctId ?? ''))}`, permanent: false },
});

export default function TrialRedirect() {
  return null;
}
