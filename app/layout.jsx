import localFont from 'next/font/local';
import './globals.css';

/* Cairo is self-hosted from @fontsource-variable/cairo (committed to npm,
   not fetched from Google at build time) so the build works fully offline.
   Same variable font + arabic/latin subsets as the previous next/font/google
   setup — the design is unchanged. */
const cairo = localFont({
  src: [
    {
      path: '../node_modules/@fontsource-variable/cairo/files/cairo-arabic-wght-normal.woff2',
      weight: '200 1000',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource-variable/cairo/files/cairo-latin-wght-normal.woff2',
      weight: '200 1000',
      style: 'normal',
    },
  ],
  variable: '--font-body',
  display: 'swap',
});

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
        <script
          dangerouslySetInnerHTML={{
            __html:
              "setTimeout(function(){if(!window.__appBooted){var b=document.getElementById('boot-fallback');if(b)b.style.display='block';}},3000)",
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var K='halqati-reload-at';var prev=+sessionStorage.getItem(K)||0;if(Date.now()-prev<60000)return;function boom(){sessionStorage.setItem(K,Date.now());location.reload()}window.addEventListener('error',function(e){var m=(e&&e.message)||'';if(/dynamically imported module|Importing a module script failed|Loading chunk/.test(m)||(e&&e.target&&(e.target.tagName==='SCRIPT'||e.target.tagName==='LINK'))){boom()}},true);}catch(_){}})()",
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var M='halqati-reload-at';try{if(Date.now()-(+sessionStorage.getItem(M)||0)<60000)return;var HERE='" +
              (process.env.NEXT_PUBLIC_BUILD || '') +
              "';fetch(location.pathname+'?v='+Date.now(),{cache:'no-store'}).then(function(r){return r.text()}).then(function(t){var m=t.match(/([0-9]{6}-[0-9]{4})/);if(m&&HERE&&m[1]!==HERE){sessionStorage.setItem(M,Date.now());location.reload()}}).catch(function(){})}catch(_){}})()",
          }}
        />
      </head>
      <body className="bg-slate-100 font-naskh text-slate-800 antialiased">
        {/* shown only if the client bundle never boots (3s failsafe above) */}
        <div
          id="boot-fallback"
          dir="rtl"
          style={{ display: 'none' }}
          className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-slate-300 bg-white p-4 text-center"
        >
          <p className="mb-2 text-sm font-bold text-slate-700">
            تعذّر تشغيل التطبيق (انتهت مهلة ٣ ثوانٍ). جرّب إعادة المحاولة أو حدّث الصفحة
            بتخطي الكاش (Ctrl+Shift+R).
          </p>
          <button
            onClick="location.reload()"
            style={{ background: '#065f46', color: '#fff' }}
            className="rounded-lg px-5 py-2 text-sm font-extrabold"
          >
            ⟳ إعادة المحاولة / الدخول
          </button>
        </div>
        {children}
      </body>

    </html>
  );
}

