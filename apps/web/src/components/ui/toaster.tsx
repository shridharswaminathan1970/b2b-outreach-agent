// Minimal toast system (no external toast lib): a module-level store + a fixed
// Toaster that renders the active toasts. Call toast({...}) from anywhere.
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ToastItem {
  id: number;
  title?: string;
  description?: string;
  variant?: 'default' | 'success' | 'destructive';
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

function emit() {
  for (const l of listeners) l([...toasts]);
}

export function toast(input: Omit<ToastItem, 'id'>): void {
  const item: ToastItem = { id: nextId++, variant: 'default', ...input };
  toasts = [...toasts, item];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id);
    emit();
  }, 4000);
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto rounded-md border p-4 shadow-lg',
            t.variant === 'destructive'
              ? 'border-destructive/40 bg-destructive text-destructive-foreground'
              : t.variant === 'success'
                ? 'border-emerald-200 bg-emerald-600 text-white'
                : 'bg-card text-card-foreground',
          )}
        >
          {t.title && <div className="text-sm font-semibold">{t.title}</div>}
          {t.description && <div className="text-sm opacity-90">{t.description}</div>}
        </div>
      ))}
    </div>
  );
}
