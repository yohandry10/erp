"use client";

import { useCallback, useSyncExternalStore } from "react";

export type DashboardTheme = "dark" | "light";

export const DASHBOARD_THEME_STORAGE_KEY = "erp-dashboard-theme";
const DASHBOARD_THEME_CHANGE_EVENT = "erp-dashboard-theme-change";

function readBrowserTheme(): DashboardTheme {
  if (typeof window === "undefined") return "dark";

  // localStorage es la fuente persistida; el atributo del documento es sólo su
  // proyección visual. Durante una navegación/hidratación tardía, un layout
  // todavía puede contener el atributo anterior y no debe revertir la elección.
  const storedTheme = window.localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  const documentTheme = document.documentElement.dataset.erpTheme;
  if (documentTheme === "light" || documentTheme === "dark") {
    return documentTheme;
  }

  return "dark";
}

function readServerTheme(): DashboardTheme {
  return "dark";
}

function subscribeToTheme(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  window.addEventListener(DASHBOARD_THEME_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener(DASHBOARD_THEME_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function useDashboardTheme() {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    readBrowserTheme,
    readServerTheme,
  );

  const applyTheme = useCallback(
    (nextTheme: DashboardTheme | ((currentTheme: DashboardTheme) => DashboardTheme)) => {
      const resolvedTheme =
        typeof nextTheme === "function"
          ? nextTheme(readBrowserTheme())
          : nextTheme;

      document.documentElement.dataset.erpThemeTransition = "off";
      document.documentElement.dataset.erpTheme = resolvedTheme;
      window.localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, resolvedTheme);
      window.dispatchEvent(new Event(DASHBOARD_THEME_CHANGE_EVENT));

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          delete document.documentElement.dataset.erpThemeTransition;
        });
      });
    },
    [],
  );

  const toggleTheme = useCallback(() => {
    applyTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }, [applyTheme]);

  return {
    theme,
    setTheme: applyTheme,
    toggleTheme,
  };
}
