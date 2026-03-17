"use client";

import { Toaster } from "react-hot-toast";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      gutter={10}
      containerStyle={{
        top: 20,
        left: 20,
        right: 20,
      }}
      toastOptions={{
        duration: 4000,
        style: {
          borderRadius: "18px",
          background: "#fffdf9",
          color: "#1f2937",
          border: "1px solid #e7dcc7",
          boxShadow: "0 18px 42px -26px rgba(15, 23, 42, 0.38)",
          padding: "12px 14px",
          fontSize: "13px",
          maxWidth: "420px",
        },
      }}
    />
  );
}
