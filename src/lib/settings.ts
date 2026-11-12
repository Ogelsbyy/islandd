import { useCallback, useEffect, useState } from "react";

export interface Settings {
  accent: string;
  opacity: number; // 0.6..1
  city: string; // empty = auto by IP
  provider: "gemini" | "deepseek";
  geminiKey: string;
  geminiModel: string;
  deepseekKey: string;
  deepseekModel: string;
  cwd: string;
  openOnHover: boolean;
}

export const DEFAULTS: Settings = {
  accent: "#ff9f43",
  opacity: 1,
  city: "",
  provider: "deepseek",
  geminiKey: "",
  geminiModel: "gemini-2.5-flash",
  deepseekKey: "",
  deepseekModel: "deepseek-chat",
  cwd: "",
  openOnHover: true,
};

const KEY = "island.settings.v1";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...(fallback as object), ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadRaw<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export function useSettings() {
  const [s, setS] = useState<Settings>(() => load(KEY, DEFAULTS));
  useEffect(() => { save(KEY, s); }, [s]);
  const patch = useCallback((p: Partial<Settings>) => setS((prev) => ({ ...prev, ...p })), []);
  return [s, patch] as const;
}
