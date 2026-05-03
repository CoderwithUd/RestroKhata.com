export const RAW_API_BASE_URL =
  // process.env.NEXT_PUBLIC_API_BASE_URL || "https://restro-backend-hpx8.onrender.com";
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

export const API_BASE_URL = RAW_API_BASE_URL.endsWith("/api")
  ? RAW_API_BASE_URL
  : `${RAW_API_BASE_URL.replace(/\/+$/, "")}/api`;
