import { invoke as tinvoke } from "@tauri-apps/api/core";
import { listen as tlisten } from "@tauri-apps/api/event";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (inTauri) return tinvoke<T>(cmd, args);
  return (await mock(cmd, args)) as T;
}

export async function listen<T>(event: string, cb: (payload: T) => void): Promise<() => void> {
  if (inTauri) {
    const un = await tlisten<T>(event, (e) => cb(e.payload));
    return un;
  }
  return () => {};
}

// ---- browser preview mocks (only used with `npm run dev` in a normal browser) ----
const FORECAST = () => {
  const now = new Date();
  const hours: string[] = [];
  const temps: number[] = [];
  const codes: number[] = [];
  for (let i = 0; i < 48; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), i);
    hours.push(d.toISOString().slice(0, 13) + ":00");
    temps.push(Math.round(10 + 6 * Math.sin((i - 9) / 3.8)));
    codes.push(i % 9 < 5 ? 1 : 3);
  }
  return {
    current: {
      time: now.toISOString().slice(0, 13) + ":00",
      temperature_2m: 14.6,
      apparent_temperature: 13.2,
      relative_humidity_2m: 64,
      pressure_msl: 1018,
      wind_speed_10m: 3.4,
      wind_direction_10m: 225,
      weather_code: 1,
      uv_index: 1.2,
    },
    hourly: { time: hours, temperature_2m: temps, weather_code: codes },
    daily: {
      temperature_2m_max: [16.1, 14.0],
      temperature_2m_min: [8.4, 7.9],
      sunrise: ["2026-11-13T06:58", "2026-11-14T07:00"],
      sunset: ["2026-11-13T16:23", "2026-11-14T16:21"],
    },
  };
};

let mockPlaying = true;
async function mock(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  switch (cmd) {
    case "set_island_size":
    case "quit_app":
      return null;
    case "copy_text":
      try { await navigator.clipboard.writeText(String(args?.text ?? "")); } catch { /* ignore */ }
      return null;
    case "http_get": {
      const url = String(args?.url ?? "");
      if (url.includes("ipapi")) return JSON.stringify({ city: "Київ", latitude: 50.45, longitude: 30.52 });
      if (url.includes("geocoding")) return JSON.stringify({ results: [{ name: "Київ", latitude: 50.45, longitude: 30.52 }] });
      return JSON.stringify(FORECAST());
    }
    case "run_shell": {
      const c = String(args?.command ?? "");
      return { stdout: `PS> ${c}\n(демо-режим: в браузере команды не выполняются)`, stderr: "", code: 0 };
    }
    case "take_screenshot":
      return "C:\\Users\\you\\Pictures\\Island\\screenshot-demo.png|1920|1080";
    case "media_info":
      return JSON.stringify({ title: "On & On", artist: "Cartoon feat. Daniel Levi", playing: mockPlaying, pos: 42, dur: 208 });
    case "media_key":
      if (args?.action === "play_pause") mockPlaying = !mockPlaying;
      return null;
    case "ai_chat":
      throw new Error("Укажи API-ключ в настройках");
    default:
      return null;
  }
}
