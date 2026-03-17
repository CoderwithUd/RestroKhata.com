"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "danger";
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

type ActiveDialog = Required<Omit<ConfirmOptions, "title">> & { title: string };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const closeDialog = useCallback((value: boolean) => {
    setDialog(null);
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resolver?.(value);
  }, []);

  const confirm = useCallback<ConfirmFn>((options) => {
    setDialog({
      title: options.title || "Please Confirm",
      message: options.message,
      confirmText: options.confirmText || "Confirm",
      cancelText: options.cancelText || "Cancel",
      tone: options.tone || "default",
    });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!dialog) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDialog, dialog]);

  useEffect(() => {
    return () => {
      if (resolverRef.current) {
        resolverRef.current(false);
        resolverRef.current = null;
      }
    };
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {dialog ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close confirmation"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => closeDialog(false)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-[#eadcc3] bg-[linear-gradient(180deg,#fffdf9_0%,#fff7ea_100%)] shadow-[0_28px_65px_-36px_rgba(15,23,42,0.55)]">
            <div className="border-b border-[#efe5d4] bg-[linear-gradient(135deg,#f3e5b7_0%,#f9f1dd_42%,#fffdf9_100%)] px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Confirmation</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">{dialog.title}</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm leading-6 text-slate-600">{dialog.message}</p>
            </div>
            <div className="flex gap-2 border-t border-[#efe5d4] px-5 py-4">
              <button
                type="button"
                onClick={() => closeDialog(false)}
                className="flex-1 rounded-2xl border border-[#ddd4c1] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                {dialog.cancelText}
              </button>
              <button
                type="button"
                onClick={() => closeDialog(true)}
                className={`flex-1 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg ${
                  dialog.tone === "danger"
                    ? "bg-[linear-gradient(135deg,#e05252_0%,#b91c1c_100%)] shadow-rose-500/25"
                    : "bg-[linear-gradient(135deg,#d97706_0%,#f59e0b_100%)] shadow-amber-500/25"
                }`}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used within ConfirmProvider");
  return context;
}
