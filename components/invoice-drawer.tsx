"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { InvoicePreviewView } from "./invoice-preview-view";
import { InvoiceEditView } from "./invoice-edit-view";

interface InvoiceDrawerProps {
  invoiceId: string | null;
  orderIds?: string[] | null;
  mode?: "view" | "edit";
  onClose: () => void;
  onSuccess?: (id: string) => void;
}

export function InvoiceDrawer({ invoiceId, orderIds, mode = "view", onClose, onSuccess }: InvoiceDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localMode, setLocalMode] = useState<"view" | "edit">(mode);
  const [currentInvoiceId, setCurrentInvoiceId] = useState<string | null>(invoiceId);

  useEffect(() => {
    if (invoiceId || (orderIds && orderIds.length > 0)) {
      setCurrentInvoiceId(invoiceId);
      // Only set mode from props if the drawer is currently closed (opening for the first time)
      if (!isOpen) {
        setLocalMode(mode);
      }
      
      // Trigger opening animation
      const timer = setTimeout(() => setIsOpen(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsOpen(false);
    }
  }, [invoiceId, orderIds]);

  // If the mode prop explicitly changes while the drawer is open, we should respect it
  useEffect(() => {
    if (isOpen) {
      setLocalMode(mode);
    }
  }, [mode]);

  if (!currentInvoiceId && (!orderIds || orderIds.length === 0)) return null;

  return (
    <div className={`fixed inset-0 z-[100] flex justify-end transition-opacity duration-300 ${isOpen ? "bg-slate-900/40 backdrop-blur-sm opacity-100" : "bg-slate-900/0 backdrop-blur-none opacity-0 pointer-events-none"}`} onClick={onClose}>
      <div
        className={`relative flex h-full w-full flex-col bg-white shadow-2xl transition-transform duration-500 ease-out sm:max-w-2xl sm:rounded-l-[40px] ${isOpen ? "translate-x-0" : "translate-x-full"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button - Desktop (Floating Left) */}
        <button
          onClick={onClose}
          className="absolute -left-16 top-8 hidden h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition-all hover:bg-white/30 hover:scale-110 active:scale-95 sm:flex"
        >
          <X size={24} strokeWidth={2.5} />
        </button>

        {/* Drawer Content */}
        <div className="flex-1 overflow-hidden">
          {localMode === "edit" ? (
            <InvoiceEditView
              invoiceId={invoiceId || undefined}
              orderIds={orderIds || undefined}
              onBack={onClose}
              onSuccess={(newId) => {
                setCurrentInvoiceId(newId);
                if (onSuccess) onSuccess(newId);
                setLocalMode("view");
              }}
            />
          ) : (
            <InvoicePreviewView invoiceId={currentInvoiceId!} onBack={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}
