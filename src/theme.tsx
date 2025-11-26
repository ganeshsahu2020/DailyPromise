import React, { useEffect } from "react";

/** Force dark mode globally (Tailwind darkMode:'class' + CSS variables) */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");
    root.setAttribute("data-theme", "dark");
    try {
      // Clear any saved preference that could flip themes elsewhere
      localStorage.removeItem("theme");
    } catch {}
  }, []);
  return <>{children}</>;
}

/** Dark-only hook so existing imports don’t break */
export function useTheme() {
  return {
    theme: "dark" as const,
    setTheme: (_: "dark") => {},
    toggle: () => {}, // no-op
  };
}

export default ThemeProvider;
