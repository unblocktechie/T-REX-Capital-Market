import { useEffect } from 'react';
import { appConfig } from '@/config/app.config';

export const useDocumentTitle = (title) => {
  useEffect(() => {
    document.title = title ? `${title} · ${appConfig.name}` : appConfig.name;
  }, [title]);
};
