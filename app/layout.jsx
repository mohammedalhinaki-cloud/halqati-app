import { Cairo } from 'next/font/google';
import './globals.css';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-body', display: 'swap' });

export const metadata = {
  title: 'بطاقة متابعة الحفظ والمراجعة',
  description: 'Quran Halaqa tracker — خطة حفظ يومية بأوجه المصحف، مع تأجيل تلقائي ذكي',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="bg-slate-100 font-naskh text-slate-800 antialiased">{children}</body>
    </html>
  );
}
