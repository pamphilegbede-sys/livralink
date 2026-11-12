import React, { useEffect } from 'react';
import { useVersionUpdate } from '../../hooks/useVersionUpdate';

/**
 * UpdateNotificationBanner handles automatic background version updates.
 * Returns null so no visible update notification banner is rendered to users.
 */
export const UpdateNotificationBanner: React.FC = () => {
  const { isUpdateAvailable, applyUpdate } = useVersionUpdate();

  useEffect(() => {
    if (isUpdateAvailable) {
      applyUpdate();
    }
  }, [isUpdateAvailable, applyUpdate]);

  return null;
};
