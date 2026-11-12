import { invoke } from "../lib/tauri";
import type { Settings } from "../lib/settings";

const COLORS = ["#ff9f43", "#ff5d73", "#c084fc", "#60a5fa", "#34d399", "#facc15", "#f5f5f5"];

export default function SettingsTab({ s, patch }: { s: Settings; patch: (p: Partial<Settings>) => void }) {
  return (
    <div className="settings">
      <label>Цвет острова
        <span className="swatches">
          {COLORS.map((c) => (
            <button key={c} className={`sw ${s.accent === c ? "on" : ""}`} style={{ background: c }} onClick={() => patch({ accent: c })} aria-label={c} />
          ))}
        </span>
      </label>
      <label>Прозрачность
        <input type="range" min={0.6} max={1} step={0.05} value={s.opacity} onChange={(e) => patch({ opacity: Number(e.target.value) })} />
      </label>
      <label>Раскрывать при наведении
        <input type="checkbox" checked={s.openOnHover} onChange={(e) => patch({ openOnHover: e.target.checked })} />
      </label>
      <label>Город для погоды (пусто — авто)
        <input value={s.city} onChange={(e) => patch({ city: e.target.value })} placeholder="Например, Киев" />
      </label>
      <label>Папка терминала
        <input value={s.cwd} onChange={(e) => patch({ cwd: e.target.value })} placeholder="C:\Users\…" />
      </label>
      <label>DeepSeek API-ключ
        <input type="password" value={s.deepseekKey} onChange={(e) => patch({ deepseekKey: e.target.value })} placeholder="sk-…" />
      </label>
      <label>Gemini API-ключ
        <input type="password" value={s.geminiKey} onChange={(e) => patch({ geminiKey: e.target.value })} placeholder="AIza…" />
      </label>
      <div className="s-foot">
        <span className="muted">Остров живёт в трее. Esc — свернуть.</span>
        <button className="btn ghost" onClick={() => invoke("quit_app")}>Выйти из Island</button>
      </div>
    </div>
  );
}
