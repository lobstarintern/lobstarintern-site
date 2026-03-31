"use client";

import { useState, useEffect } from "react";

export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    // Sync state with what the blocking script already applied
    setLight(document.documentElement.classList.contains("light"));
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    localStorage.setItem("theme", next ? "light" : "dark");
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle light/dark mode"
      className="theme-toggle"
      title={light ? "Switch to dark mode" : "Switch to light mode"}
    >
      {light ? "\u263E" : "\u2600"}
    </button>
  );
}
