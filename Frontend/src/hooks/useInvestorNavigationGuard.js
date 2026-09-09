import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export function useInvestorNavigationGuard(hasUnsavedChanges) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      Boolean(hasUnsavedChanges) && currentLocation.pathname !== nextLocation.pathname,
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
      'Your latest investor onboarding changes are still being saved. Leave this page?',
    );
    if (shouldLeave) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
}
