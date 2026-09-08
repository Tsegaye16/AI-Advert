import { createContext, useContext } from "react";

export interface PageTitleValue {
  title: string;
  setTitle: (title: string) => void;
}

export const PageTitleContext = createContext<PageTitleValue>({
  title: "",
  setTitle: () => {},
});

export function usePageTitleContext() {
  return useContext(PageTitleContext);
}
