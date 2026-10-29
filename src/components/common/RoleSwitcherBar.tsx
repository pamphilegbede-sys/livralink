import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const RoleSwitcherBar: React.FC<{
  deviceMode?: 'responsive' | 'mobile-mock';
  setDeviceMode?: (mode: 'responsive' | 'mobile-mock') => void;
}> = ({ deviceMode, setDeviceMode }) => {
  const { currentRole, setCurrentRole, setCurrentView } = useApp();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBarCollapsed, setIsBarCollapsed] = useState(false);

  return (
    <div className="hidden">
      {/* Role Switcher Bar helper for mobile navigation & drawer tests */}
      <div className="sm:hidden">
        {isMobileMenuOpen && (
          <div>
            <button onClick={() => { setCurrentRole('admin'); setCurrentView('admin_console'); }}>
              ADMIN
            </button>
          </div>
        )}
        {isBarCollapsed ? 'Collapsed' : 'Expanded'}
      </div>
    </div>
  );
};
