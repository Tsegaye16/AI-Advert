import { useEffect } from "react";
import { usePageTitleContext } from "../AppShell/pageTitleContext";

const SUFFIX = "AdVault";

/**
 * Sets the browser tab title and the shell topbar heading for the current page.
 */
export function PageMeta({ title }: { title: string }) {
  const { setTitle } = usePageTitleContext();

  useEffect(() => {
    setTitle(title);
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
    return () => {
      document.title = SUFFIX;
    };
  }, [title, setTitle]);

  return null;
}
