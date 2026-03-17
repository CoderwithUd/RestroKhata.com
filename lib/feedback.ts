"use client";

import { toast } from "react-hot-toast";

function baseOptions() {
  return {
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
  } as const;
}

export function showSuccess(message: string) {
  return toast.success(message, {
    ...baseOptions(),
    iconTheme: {
      primary: "#0f766e",
      secondary: "#ecfdf5",
    },
  });
}

export function showError(message: string) {
  return toast.error(message, {
    ...baseOptions(),
    iconTheme: {
      primary: "#b91c1c",
      secondary: "#fff1f2",
    },
  });
}

export function showInfo(message: string) {
  return toast(message, {
    ...baseOptions(),
    icon: "i",
  });
}
