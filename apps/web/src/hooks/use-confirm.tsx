'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Confirmación reutilizable y accesible (reemplaza window.confirm). Se monta una vez
// en el layout; cualquier pantalla pide confirmación con: const ok = await confirm({...}).
interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => close(false)}
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>{opts.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {opts.message && <p className="text-sm text-foreground-muted">{opts.message}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => close(false)}>
                  {opts.cancelLabel ?? 'Cancelar'}
                </Button>
                <Button variant={opts.destructive ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
                  {opts.confirmLabel ?? 'Confirmar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
