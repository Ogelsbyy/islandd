import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke, listen } from "./lib/tauri";
import { loadRaw, save, useSettings } from "./lib/settings";
import { codeInfo, useWeather } from "./lib/weather";
import Home from "./tabs/Home";
import Music, { useMedia } from "./tabs/Music";
import WeatherTab from "./tabs/WeatherTab";
import Chat from "./tabs/Chat";
import Terminal from "./tabs/Terminal";
import TimerTab from "./tabs/TimerTab";
import SettingsTab from "./tabs/SettingsTab";

export type TabId = "home" | "music" | "weather" | "chat" | "terminal" | "timer" | "settings";
export interface Clip { id: number; kind: "text" | "image"; text: string; w: number; h: number; at: number }
export interface TimerState { endsAt: number | null; total: number; done: boolean }

const TABS: { id: TabId; label: string }[] = [
  { id: "home", label: "Главная" },
  { id: "music", label: "Музыка" },
  { id: "weather", label: "Погода" },
  { id: "chat", label: "Чат" },
  { id: "terminal", label: "Терминал" },
  { id: "timer", label: "Таймер" },
  { id: "settings", label: "⚙" },
];

const SIZES = {
  pill: [244, 48],
  pillTimer: [300, 48],
  open: [640, 392],
  alert: [470, 72],
  toast: [470, 72],
} as const;

function fmtClock(d: Date) {
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
export function fmtDur(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5, 0.9, 1.15, 1.4].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => ctx.close(), 2500);
  } catch { /* audio not available */ }
}

export default function App() {
  const [settings, patch] = useSettings();
  const [tab, setTab] = useState<TabId>("home");
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [clips, setClips] = useState<Clip[]>(() => loadRaw<Clip[]>("island.clips.v1", []));
  const [timer, setTimer] = useState<TimerState>(() => loadRaw<TimerState>("island.timer.v1", { endsAt: null, total: 0, done: false }));
  const leaveTimer = useRef<number | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);

  const weather = useWeather(settings.city);
  const expanded = hover || pinned;
  const media = useMedia(expanded);

  // clock + timer tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { save("island.clips.v1", clips.slice(0, 30)); }, [clips]);
  useEffect(() => { save("island.timer.v1", timer); }, [timer]);

  const remaining = timer.endsAt ? Math.max(0, (timer.endsAt - now.getTime()) / 1000) : 0;
  useEffect(() => {
    if (timer.endsAt && now.getTime() >= timer.endsAt) {
      setTimer((t) => ({ ...t, endsAt: null, done: true }));
      beep();
    }
  }, [now, timer.endsAt]);

  const startTimer = useCallback((sec: number) => {
    setTimer({ endsAt: Date.now() + sec * 1000, total: sec, done: false });
  }, []);
  const stopTimer = useCallback(() => setTimer({ endsAt: null, total: 0, done: false }), []);

  // clipboard events from Rust
  useEffect(() => {
    let un: (() => void) | undefined;
    listen<{ kind: "text" | "image"; text: string; width: number; height: number }>("clipboard", (p) => {
      setClips((prev) => {
        if (p.kind === "text" && prev[0]?.kind === "text" && prev[0].text === p.text) return prev;
        const c: Clip = { id: Date.now(), kind: p.kind, text: p.text.slice(0, 1000), w: p.width, h: p.height, at: Date.now() };
        return [c, ...prev].slice(0, 30);
      });
    }).then((u) => (un = u));
    return () => un?.();
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 4000);
  }, []);

  // pick mode + size
  const mode: "alert" | "toast" | "open" | "pill" = timer.done ? "alert" : toast && !expanded ? "toast" : expanded ? "open" : "pill";
  const size = mode === "pill" ? (timer.endsAt ? SIZES.pillTimer : SIZES.pill) : SIZES[mode];

  useEffect(() => {
    invoke("set_island_size", { width: size[0], height: size[1] }).catch(() => {});
  }, [size[0], size[1]]);

  // hover logic
  const typing = () => {
    const el = document.activeElement;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  };
  const onEnter = () => {
    window.clearTimeout(leaveTimer.current);
    if (settings.openOnHover) setHover(true);
  };
  const onLeave = () => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      if (typing()) return;
      setHover(false);
    }, 450);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPinned(false); setHover(false); (document.activeElement as HTMLElement | null)?.blur?.(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ci = codeInfo(weather.data?.code ?? -1);
  const style = useMemo(
    () => ({ "--w": `${size[0]}px`, "--h": `${size[1]}px`, "--accent": settings.accent, "--op": settings.opacity }) as React.CSSProperties,
    [size, settings.accent, settings.opacity],
  );

  return (
    <div className="stage">
      <div ref={rootRef} className={`island ${mode}`} style={style} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={() => { if (!expanded) setHover(true); }}>
        {mode === "pill" && (
          <div className="pill-row">
            {media.info?.playing ? <Eq /> : <span className="pill-icon">{ci.icon}</span>}
            <span className="pill-time">{fmtClock(now)}</span>
            {timer.endsAt ? <span className="pill-timer">⏱ {fmtDur(remaining)}</span> : <span className="pill-temp">{weather.data ? `${weather.data.temp}°` : "–"}</span>}
          </div>
        )}

        {mode === "toast" && <div className="toast-row">{toast}</div>}

        {mode === "alert" && (
          <div className="alert-row">
            <div className="alert-ico">⏰</div>
            <div className="alert-text"><b>Время вышло</b><span>Таймер · {Math.round(timer.total / 60)} мин</span></div>
            <button className="btn ghost" onClick={() => startTimer(300)}>Ещё раз</button>
            <button className="btn round" onClick={stopTimer}>✓</button>
          </div>
        )}

        {mode === "open" && (
          <div className="panel">
            <div className="tabs">
              {TABS.map((t) => (
                <button key={t.id} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
              ))}
              <span className="grow" />
              <button className={`tab ${pinned ? "on" : ""}`} title="Закрепить" onClick={() => setPinned((p) => !p)}>📌</button>
            </div>
            <div className="body">
              {tab === "home" && <Home clips={clips} setClips={setClips} media={media} toast={showToast} goto={setTab} />}
              {tab === "music" && <Music media={media} />}
              {tab === "weather" && <WeatherTab w={weather} />}
              {tab === "chat" && <Chat settings={settings} />}
              {tab === "terminal" && <Terminal cwd={settings.cwd} />}
              {tab === "timer" && <TimerTab timer={timer} remaining={remaining} start={startTimer} stop={stopTimer} />}
              {tab === "settings" && <SettingsTab s={settings} patch={patch} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Eq() {
  return (
    <span className="eq"><i /><i /><i /><i /></span>
  );
}
