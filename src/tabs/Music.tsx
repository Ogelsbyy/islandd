import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../lib/tauri";
import { fmtDur } from "../App";

export interface MediaInfo { title?: string; artist?: string; playing?: boolean; pos?: number; dur?: number }
export interface MediaApi { info: MediaInfo | null; refresh: () => void; key: (a: string) => Promise<void> }

export function useMedia(active: boolean): MediaApi {
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const raw = await invoke<string>("media_info");
      const j = raw ? JSON.parse(raw) : {};
      setInfo(j && j.title ? j : null);
    } catch {
      setInfo(null);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, active ? 2500 : 8000);
    return () => clearInterval(t);
  }, [active, refresh]);

  const key = useCallback(async (a: string) => {
    try { await invoke("media_key", { action: a }); } catch { /* ignore */ }
    setTimeout(refresh, 400);
  }, [refresh]);

  return { info, refresh, key };
}

export default function Music({ media }: { media: MediaApi }) {
  const { info, key } = media;
  const [tick, setTick] = useState(0);
  const base = useRef({ pos: 0, at: Date.now() });

  useEffect(() => { base.current = { pos: info?.pos ?? 0, at: Date.now() }; }, [info]);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, []);

  if (!info) {
    return <div className="empty">Ничего не играет.<br /><small>Запусти музыку в Spotify, браузере или проигрывателе Windows.</small></div>;
  }
  const dur = info.dur ?? 0;
  const pos = Math.min(dur || Infinity, base.current.pos + (info.playing ? (Date.now() - base.current.at) / 1000 : 0));
  void tick;
  return (
    <div className="music">
      <div className="cover" />
      <div className="m-main">
        <div className="m-title">{info.title}</div>
        <div className="m-artist">{info.artist}</div>
        <div className="bar"><div style={{ width: dur ? `${(pos / dur) * 100}%` : "0%" }} /></div>
        <div className="m-time"><span>{fmtDur(pos)}</span><span>{dur ? fmtDur(dur) : ""}</span></div>
        <div className="m-ctl">
          <button className="btn round" onClick={() => key("prev")}>⏮</button>
          <button className="btn round big" onClick={() => key("play_pause")}>{info.playing ? "⏸" : "▶"}</button>
          <button className="btn round" onClick={() => key("next")}>⏭</button>
          <span className="grow" />
          <button className="btn ghost" onClick={() => key("vol_down")}>🔉 −</button>
          <button className="btn ghost" onClick={() => key("vol_up")}>🔊 +</button>
          <button className="btn ghost" onClick={() => key("mute")}>🔇</button>
        </div>
      </div>
    </div>
  );
}
