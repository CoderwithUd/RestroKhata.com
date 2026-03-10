import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";

export function getErrorMessage(error: unknown): string {
  if (!error) return "Something went wrong. Please try again.";

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  const fetchError = error as FetchBaseQueryError & {
    data?: unknown;
    error?: string;
  };

  if (typeof fetchError.error === "string" && fetchError.error.trim()) {
    return fetchError.error;
  }

  if (typeof fetchError.data === "string" && fetchError.data.trim()) {
    return fetchError.data;
  }

  if (
    fetchError.data &&
    typeof fetchError.data === "object" &&
    "message" in fetchError.data &&
    typeof (fetchError.data as { message?: unknown }).message === "string"
  ) {
    return (fetchError.data as { message: string }).message;
  }

  return "Request failed. Please check details and retry.";
}
