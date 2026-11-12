import { useCallback, useEffect, useState } from "react";
import { invoke } from "./tauri";

export interface Weather {
  place: string;
  temp: number;
  feels: number;
  code: number;
  humidity: number;
  pressureMm: number;
  windMs: number;
  windDir: number;
  uv: number;
  tmax: number;
  tmin: number;
  sunrise: string;
  sunset: string;
  hours: { label: string; temp: number; code: number }[];
}

export function codeInfo(code: number): { icon: string; text: string } {
  if (code === 0) return { icon: "☀️", text: "Ясно" };
  if (code === 1) return { icon: "🌤️", text: "Преимущественно ясно" };
  if (code === 2) return { icon: "⛅", text: "Переменная облачность" };
  if (code === 3) return { icon: "☁️", text: "Пасмурно" };
  if (code === 45 || code === 48) return { icon: "🌫️", text: "Туман" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", text: "Морось" };
  if (code >= 61 && code <= 67) return { icon: "🌧️", text: "Дождь" };
  if (code >= 71 && code <= 77) return { icon: "🌨️", text: "Снег" };
  if (code >= 80 && code <= 82) return { icon: "🌧️", text: "Ливень" };
  if (code === 85 || code === 86) return { icon: "🌨️", text: "Снегопад" };
  if (code >= 95) return { icon: "⛈️", text: "Гроза" };
  return { icon: "🌡️", text: "—" };
}

async function getJson(url: string): Promise<any> {
  return JSON.parse(await invoke<string>("http_get", { url }));
}

async function locate(city: string): Promise<{ place: string; lat: number; lon: number }> {
  if (city.trim()) {
    const g = await getJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1&language=ru`,
    );
    const r = g.results?.[0];
    if (!r) throw new Error("Город не найден");
    return { place: r.name, lat: r.latitude, lon: r.longitude };
  }
  try {
    const ip = await getJson("https://ipapi.co/json/");
    if (ip.latitude && ip.longitude) return { place: ip.city ?? "Здесь", lat: ip.latitude, lon: ip.longitude };
  } catch { /* fall through */ }
  return { place: "Киев", lat: 50.45, lon: 30.52 };
}

export async function fetchWeather(city: string): Promise<Weather> {
  const { place, lat, lon } = await locate(city);
  const f = await getJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,weather_code,uv_index` +
      `&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset` +
      `&timezone=auto&wind_speed_unit=ms&forecast_days=2`,
  );
  const c = f.current;
  const idx = Math.max(0, (f.hourly.time as string[]).findIndex((t) => t >= c.time));
  const hours = [];
  for (let i = idx; i < idx + 8 && i < f.hourly.time.length; i++) {
    hours.push({
      label: (f.hourly.time[i] as string).slice(11, 16),
      temp: Math.round(f.hourly.temperature_2m[i]),
      code: f.hourly.weather_code[i],
    });
  }
  return {
    place,
    temp: Math.round(c.temperature_2m),
    feels: Math.round(c.apparent_temperature),
    code: c.weather_code,
    humidity: Math.round(c.relative_humidity_2m),
    pressureMm: Math.round(c.pressure_msl * 0.750062),
    windMs: Math.round(c.wind_speed_10m * 10) / 10,
    windDir: c.wind_direction_10m,
    uv: Math.round(c.uv_index * 10) / 10,
    tmax: Math.round(f.daily.temperature_2m_max[0]),
    tmin: Math.round(f.daily.temperature_2m_min[0]),
    sunrise: (f.daily.sunrise[0] as string).slice(11, 16),
    sunset: (f.daily.sunset[0] as string).slice(11, 16),
    hours,
  };
}

export function useWeather(city: string) {
  const [data, setData] = useState<Weather | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchWeather(city));
      setError(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20 * 60 * 1000);
    return () => clearInterval(t);
  }, [refresh]);

  return { data, error, loading, refresh };
}
