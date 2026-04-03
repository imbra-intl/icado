import React from 'react';
import { Outlet, useLocation } from 'react-router';
import { GlobalHeader } from './global-header';
import { AppsDataProvider } from '@/contexts/apps-data-context';
import clsx from 'clsx';

interface AppLayoutProps {
  children?: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { pathname } = useLocation();
  return (
    <AppsDataProvider>
      <div className={clsx("bg-bg-3 flex flex-col h-screen relative", pathname !== "/" && "overflow-hidden")}>
        <GlobalHeader />
        <div className={clsx("flex-1 bg-bg-3", pathname !== "/" && "min-h-0 overflow-auto")}>
          {children || <Outlet />}
        </div>
      </div>
    </AppsDataProvider>
  );
}
