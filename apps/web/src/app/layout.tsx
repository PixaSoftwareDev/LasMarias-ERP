import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/providers/query-provider';
import { ConfirmProvider } from '@/hooks/use-confirm';
import './globals.css';

// Inter en toda la app — body, títulos y wordmark. Sans SaaS moderna,
// la fuente de referencia actual (CLAUDE.md §5.2). Se expone como --font-sans;
// el token `display` apunta a la misma variable.
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: {
    default: 'Lácteos Las Marías',
    template: '%s · Lácteos Las Marías',
  },
  description: 'Sistema de gestión integral — Industria Láctea Especializada (Pergamino, Argentina).',
  applicationName: 'Lácteos Las Marías',
};

// Viewport con themeColor verde de marca para barra de status en mobile.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#059669',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`h-full ${inter.variable}`}>
      <body className="h-full font-sans antialiased">
        <QueryProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </QueryProvider>
        <Toaster
          position="top-center"
          richColors
          duration={4000}
          toastOptions={{
            classNames: { toast: 'rounded-md shadow-sm' },
          }}
        />
      </body>
    </html>
  );
}
