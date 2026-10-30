"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    // Skip service worker inside native Capacitor container where assets are bundled locally
    if ("Capacitor" in window) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal in restricted preview iframes
    });
  }, []);

  return null;
}
