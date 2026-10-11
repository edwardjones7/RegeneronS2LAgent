import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      {/* Fonts are self-hosted via next/font — see src/styles/fonts.ts */}
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
