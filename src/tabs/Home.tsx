import { invoke } from "../lib/tauri";
import type { Clip, TabId } from "../App";
import type { MediaApi } from "./Music";

interface Props {
  clips: Clip[];
  setClips: (f: (c: Clip[]) => Clip[]) => void;
  media: MediaApi;
  toast: (m: string) => void;
  goto: (t: TabId) => void;
}

const APPS: { label: string; icon: string; cmd: string }[] = [
  { label: "Проводник", icon: "📁", cmd: "Start-Process explorer" },
  { label: "PowerShell", icon: "⌨️", cmd: "Start-Process powershell" },
  { label: "Блокнот", icon: "📝", cmd: "Start-Process notepad" },
  { label: "Калькулятор", icon: "🧮", cmd: "Start-Process calc" },
  { label: "Параметры", icon: "⚙️", cmd: "Start-Process ms-settings:" },
];

function ago(at: number) {
  const m = Math.round((Date.now() - at) / 60000);
  return m < 1 ? "сейчас" : m < 60 ? `${m} мин` : `${Math.round(m / 60)} ч`;
}

export default function Home({ clips, setClips, media, toast, goto }: Props) {
  const shot = async () => {
    toast("Делаю скриншот…");
    try {
      const r = await invoke<string>("take_screenshot");
      const [path, w, h] = r.split("|");
      toast(`Скриншот готов · ${w}×${h} · в буфере и в Pictures\\Island`);
      void path;
    } catch (e) {
      toast("Не удалось сделать скриншот");
    }
  };
  const plain = async () => {
    const t = clips.find((c) => c.kind === "text");
    if (!t) return toast("В буфере нет текста");
    await invoke("copy_text", { text: t.text });
    toast("Текст в буфере очищен от форматирования");
  };
  const openShots = () => invoke("run_shell", { command: "$d = Join-Path ([Environment]::GetFolderPath('MyPictures')) 'Island'; New-Item -ItemType Directory -Force $d | Out-Null; Start-Process explorer $d" });
  const run = (cmd: string) => invoke("run_shell", { command: cmd }).catch(() => {});

  return (
    <div className="home">
      <div className="home-left">
        <div className="sec-title">Недавно скопировано <button className="link" onClick={() => setClips(() => [])}>очистить</button></div>
        <div className="clips">
          {clips.length === 0 && <div className="muted">Скопируй что-нибудь — оно появится здесь</div>}
          {clips.slice(0, 6).map((c) => (
            <button key={c.id} className="clip" onClick={() => c.kind === "text" && invoke("copy_text", { text: c.text }).then(() => toast("Скопировано"))}>
              <span className="clip-ico">{c.kind === "text" ? "T" : "🖼"}</span>
              <span className="clip-text">{c.kind === "text" ? c.text.replace(/\s+/g, " ") : `Изображение ${c.w}×${c.h}`}</span>
              <span className="clip-ago">{ago(c.at)}</span>
            </button>
          ))}
        </div>
        <div className="dock">
          {APPS.map((a) => (
            <button key={a.label} className="dock-btn" title={a.label} onClick={() => run(a.cmd)}>{a.icon}</button>
          ))}
        </div>
      </div>
      <div className="home-right">
        <button className="act" onClick={shot}><b>🖥</b>Весь экран</button>
        <button className="act" onClick={plain}><b>Aa</b>Чистый текст</button>
        <button className="act" onClick={openShots}><b>📂</b>Скриншоты</button>
        <button className="act" onClick={() => goto("terminal")}><b>›_</b>Команда</button>
        <button className="act" onClick={() => media.key("vol_down")}><b>🔉</b>Тише</button>
        <button className="act" onClick={() => media.key("vol_up")}><b>🔊</b>Громче</button>
      </div>
    </div>
  );
}
