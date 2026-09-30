import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Storage may be unavailable (private mode, file://).
  }
  return null;
}

function storeTheme(theme: Theme | null) {
  try {
    if (theme) localStorage.setItem("theme", theme);
    else localStorage.removeItem("theme");
  } catch {
    // The toggle still works for the page.
  }
}

function applyTheme(theme: Theme | null) {
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
}

/**
 * The light/dark theme: the system's, unless the reader chose the other one
 * (stored as `theme` in localStorage and set as `data-theme` on <html>).
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme() ?? getSystemTheme());

  useEffect(() => {
    applyTheme(getStoredTheme());
    // Follow the system's preference while the reader has not chosen.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (!getStoredTheme()) setThemeState(getSystemTheme());
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggle = useCallback(() => {
    const current = getStoredTheme() ?? getSystemTheme();
    const next: Theme = current === "dark" ? "light" : "dark";
    // A choice that matches the system clears the override.
    const override = next === getSystemTheme() ? null : next;
    storeTheme(override);
    applyTheme(override);
    setThemeState(next);
  }, []);

  return { theme, toggle };
}
