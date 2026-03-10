import { configureStore } from "@reduxjs/toolkit";
import { authApi } from "@/store/api/authApi";
import { menuApi } from "@/store/api/menuApi";
import { tablesApi } from "@/store/api/tablesApi";
import authReducer from "@/store/slices/authSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [authApi.reducerPath]: authApi.reducer,
    [menuApi.reducerPath]: menuApi.reducer,
    [tablesApi.reducerPath]: tablesApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(authApi.middleware, menuApi.middleware, tablesApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
