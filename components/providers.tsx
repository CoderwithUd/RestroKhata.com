"use client";

import { Provider } from "react-redux";
import type { ReactNode } from "react";
import { store } from "@/store/store";
import { AppToaster } from "@/components/app-toaster";
import { ConfirmProvider } from "@/components/confirm-provider";
import { SessionBootstrap } from "@/components/session-bootstrap";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <Provider store={store}>
      <ConfirmProvider>
        <SessionBootstrap />
        {children}
        <AppToaster />
      </ConfirmProvider>
    </Provider>
  );
}
