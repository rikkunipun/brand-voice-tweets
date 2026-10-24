import './globals.css';

export const metadata = {
  title: 'Brand Voice Tweets',
  description: 'Turn a few brand details into a transparent Voice Card and 10 on-brand tweets.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
