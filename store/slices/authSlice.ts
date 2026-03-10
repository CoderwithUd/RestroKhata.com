import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store/store";
import type { SessionPayload } from "@/store/types/auth";

type BootstrapStatus = "idle" | "loading" | "done";

type AuthState = {
  user: SessionPayload["user"];
  tenant: SessionPayload["tenant"];
  token: string | null;
  isAuthenticated: boolean;
  bootstrapStatus: BootstrapStatus;
};

const initialState: AuthState = {
  user: null,
  tenant: null,
  token: null,
  isAuthenticated: false,
  bootstrapStatus: "idle",
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    bootstrapStarted: (state) => {
      state.bootstrapStatus = "loading";
    },
    bootstrapFinished: (state) => {
      state.bootstrapStatus = "done";
    },
    setSession: (state, action: PayloadAction<SessionPayload>) => {
      state.user = action.payload.user;
      state.tenant = action.payload.tenant;
      if (action.payload.token !== undefined) {
        state.token = action.payload.token || null;
      }
      state.isAuthenticated = Boolean(state.user || state.token);
    },
    setToken: (state, action: PayloadAction<string | null>) => {
      state.token = action.payload;
      state.isAuthenticated = Boolean(state.user || state.token);
    },
    clearSession: (state) => {
      state.user = null;
      state.tenant = null;
      state.token = null;
      state.isAuthenticated = false;
    },
  },
});

export const { bootstrapStarted, bootstrapFinished, setSession, setToken, clearSession } = authSlice.actions;

export const selectAuthUser = (state: RootState) => state.auth.user;
export const selectAuthTenant = (state: RootState) => state.auth.tenant;
export const selectAuthToken = (state: RootState) => state.auth.token;
export const selectIsAuthenticated = (state: RootState) => state.auth.isAuthenticated;
export const selectAuthBootstrapStatus = (state: RootState) => state.auth.bootstrapStatus;

export default authSlice.reducer;
