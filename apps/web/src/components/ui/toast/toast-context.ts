import { createContext, use } from 'react';
import type { AlertTone } from '../Alert';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: AlertTone;
  durationMs?: number;
}

export interface ToastRecord extends ToastOptions {
  id: number;
}

export type ShowToast = (options: ToastOptions) => void;

export const ToastContext = createContext<ShowToast | null>(null);

export function useToast(): ShowToast {
  const show = use(ToastContext);
  if (!show) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return show;
}
