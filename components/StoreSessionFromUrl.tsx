"use client";

import { useEffect } from "react";

const SID_KEY = "spotify_sid";

export function StoreSessionFromUrl() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("sid");
    if (sid) {
      try {
        localStorage.setItem(SID_KEY, sid);
      } catch {
        // ignore
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("sid");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);
  return null;
}

export function getStoredSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SID_KEY);
  } catch {
    return null;
  }
}

export function clearStoredSessionId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SID_KEY);
  } catch {
    // ignore
  }
}

/** Gebruik op de startpagina: wis opgeslagen sessie na logout. */
export function ClearSessionOnHome() {
  useEffect(() => {
    clearStoredSessionId();
  }, []);
  return null;
}
