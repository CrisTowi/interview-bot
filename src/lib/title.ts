import { useEffect } from 'react';

export const APP_NAME = 'Interview Bot';

/** Keeps the browser tab describing the current screen. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
