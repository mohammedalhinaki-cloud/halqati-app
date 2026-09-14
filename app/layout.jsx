import { Cairo } from 'next/font/google';
import './globals.css';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-body', display: 'swap' });

export const metadata = {
  title: 'بطاقة متابعة الحفظ والمراجعة',
  description: 'Quran Halaqa tracker — خطة حفظ يومية بأوجه المصحف، مع تأجيل تلقائي ذكي',
  themeColor: '#065f46',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <head>
        <link rel="manifest" href="./manifest.webmanifest" />
        <link rel="icon" type="image/png" href="./icons/icon-192.png" />
        <link rel="apple-touch-icon" href="./icons/icon-180.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="حلقتي" />
      </head>
      <body className="bg-slate-100 font-naskh text-slate-800 antialiased">{children}</body>
    </html>
  );
}

