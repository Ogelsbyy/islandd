import { useState } from "react";
import type { TimerState } from "../App";
import { fmtDur } from "../App";

const PRESETS = [1, 5, 10, 15, 25, 45];

export default function TimerTab({ timer, remaining, start, stop }: { timer: TimerState; remaining: number; start: (s: number) => void; stop: () => void }) {
  const [custom, setCustom] = useState("");
  const running = timer.endsAt !== null;
  return (
    <div className="timer">
      <div className="t-big">{running ? fmtDur(remaining) : "Таймер"}</div>
      {running && (
        <div className="bar wide"><div style={{ width: `${timer.total ? (1 - remaining / timer.total) * 100 : 0}%` }} /></div>
      )}
      <div className="t-presets">
        {PRESETS.map((m) => <button key={m} className="chip" onClick={() => start(m * 60)}>{m} мин</button>)}
      </div>
      <form className="t-custom" onSubmit={(e) => { e.preventDefault(); const v = parseFloat(custom.replace(",", ".")); if (v > 0) { start(Math.round(v * 60)); setCustom(""); } }}>
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Свои минуты" inputMode="decimal" />
        <button className="btn ghost" type="submit">Старт</button>
        {running && <button className="btn ghost" type="button" onClick={stop}>Сбросить</button>}
      </form>
    </div>
  );
}
