import type { Metadata, Viewport } from 'next';
import { Roboto, Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/providers/query-provider';
import './globals.css';

// Cuerpo — Roboto (legibilidad en formularios, tablas, datos densos).
const roboto = Roboto({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-roboto',
});

// Display — Inter para wordmark y títulos de página: sans moderna,
// la fuente de referencia SaaS actual (CLAUDE.md §5.2).
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-display',
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
  themeColor: '#009B00',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`h-full ${roboto.variable} ${inter.variable}`}>
      <body className="h-full font-sans antialiased">
        <QueryProvider>{children}</QueryProvider>
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
