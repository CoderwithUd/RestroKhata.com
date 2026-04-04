import { configureStore } from "@reduxjs/toolkit";
import { authApi } from "@/store/api/authApi";
import { customersApi } from "@/store/api/customersApi";
import { invoicesApi } from "@/store/api/invoicesApi";
import { menuApi } from "@/store/api/menuApi";
import { ordersApi } from "@/store/api/ordersApi";
import { tablesApi } from "@/store/api/tablesApi";
import authReducer from "@/store/slices/authSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [authApi.reducerPath]: authApi.reducer,
    [customersApi.reducerPath]: customersApi.reducer,
    [menuApi.reducerPath]: menuApi.reducer,
    [tablesApi.reducerPath]: tablesApi.reducer,
    [ordersApi.reducerPath]: ordersApi.reducer,
    [invoicesApi.reducerPath]: invoicesApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      authApi.middleware,
      customersApi.middleware,
      menuApi.middleware,
      tablesApi.middleware,
      ordersApi.middleware,
      invoicesApi.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
