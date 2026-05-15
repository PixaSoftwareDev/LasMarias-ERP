import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/providers/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lácteos Las Marías',
  description: 'Sistema de gestión integral — Pergamino',
};

// CLAUDE.md §5.4 — móvil de primera categoría: viewport ajustado, sin zoom bloqueado.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#FAFAF9',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className="h-full">
      <body className="h-full antialiased">
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
