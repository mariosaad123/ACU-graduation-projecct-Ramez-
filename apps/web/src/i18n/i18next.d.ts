import 'i18next';
import type { ar } from './messages/ar';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof ar };
  }
}
