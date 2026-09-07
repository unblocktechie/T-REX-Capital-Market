import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

export function useOrganizationNavigationGuard(hasUnsavedChanges) {
  const bypassRef = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      Boolean(hasUnsavedChanges) &&
      !bypassRef.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;

    const shouldLeave = window.confirm(
      'You have unsaved organization changes. Leave this page without saving them?',
    );
    if (shouldLeave) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  return useCallback((navigationAction) => {
    bypassRef.current = true;
    navigationAction();
    window.setTimeout(() => {
      bypassRef.current = false;
    }, 0);
  }, []);
}
