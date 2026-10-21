import { useEffect } from 'react';
import type { InterfaceLanguage } from '@/models/profile';

export function useDocumentLocalization(language: InterfaceLanguage) {
  useEffect(() => {
    // Visible strings are translated declaratively through t(...). Updating
    // the document language is the only global DOM operation required.
    document.documentElement.lang = language;
  }, [language]);
}
