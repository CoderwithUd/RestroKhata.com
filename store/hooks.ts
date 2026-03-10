import { useDispatch, useSelector, useStore } from "react-redux";
import { store } from "@/store/store";
import type { AppDispatch, RootState } from "@/store/store";

type AppStore = typeof store;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();
