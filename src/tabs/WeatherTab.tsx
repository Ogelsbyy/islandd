import { codeInfo, useWeather } from "../lib/weather";

const DIRS = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];

export default function WeatherTab({ w }: { w: ReturnType<typeof useWeather> }) {
  const d = w.data;
  if (!d) {
    return <div className="empty">{w.error ? <>Не удалось получить погоду:<br /><small>{w.error}</small></> : "Загрузка…"}<br /><button className="btn ghost" onClick={w.refresh}>Повторить</button></div>;
  }
  const ci = codeInfo(d.code);
  return (
    <div className="weather">
      <div className="w-now">
        <div className="w-place">📍 {d.place}</div>
        <div className="w-temp">{ci.icon} {d.temp}°</div>
        <div className="w-sub">{ci.text}<br />Ощущается как {d.feels}° · {d.tmin}…{d.tmax}°</div>
        <button className="btn ghost" onClick={w.refresh}>{w.loading ? "…" : "Обновить"}</button>
      </div>
      <div className="w-grid">
        <div className="w-hours">
          {d.hours.map((h) => (
            <div key={h.label}><span>{h.label}</span><b>{codeInfo(h.code).icon}</b><span>{h.temp}°</span></div>
          ))}
        </div>
        <div className="tile"><small>Ветер</small><b>{d.windMs} м/с</b><span>{DIRS[Math.round(d.windDir / 45) % 8]}</span></div>
        <div className="tile"><small>Влажность</small><b>{d.humidity}%</b></div>
        <div className="tile"><small>Давление</small><b>{d.pressureMm}</b><span>мм рт. ст.</span></div>
        <div className="tile"><small>УФ-индекс</small><b>{d.uv}</b></div>
        <div className="tile"><small>Восход</small><b>{d.sunrise}</b></div>
        <div className="tile"><small>Закат</small><b>{d.sunset}</b></div>
      </div>
    </div>
  );
}
