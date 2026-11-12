import { useEffect, useRef, useState } from "react";
import { invoke } from "../lib/tauri";
import type { Settings } from "../lib/settings";

interface Msg { role: "user" | "assistant"; content: string; error?: boolean }

export default function Chat({ settings }: { settings: Settings }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<Settings["provider"]>(settings.provider);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      const reply = await invoke<string>("ai_chat", {
        provider,
        apiKey: provider === "gemini" ? settings.geminiKey : settings.deepseekKey,
        model: provider === "gemini" ? settings.geminiModel : settings.deepseekModel,
        messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
      });
      setMsgs([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: String(e), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat">
      <div className="chat-head">
        <button className={`chip ${provider === "deepseek" ? "on" : ""}`} onClick={() => setProvider("deepseek")}>DeepSeek</button>
        <button className={`chip ${provider === "gemini" ? "on" : ""}`} onClick={() => setProvider("gemini")}>Gemini</button>
        <span className="grow" />
        <button className="link" onClick={() => setMsgs([])}>новый чат</button>
      </div>
      <div className="chat-log">
        {msgs.length === 0 && <div className="muted">Спроси что угодно. API-ключ задаётся в ⚙ Настройках.</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role} ${m.error ? "err" : ""}`}>{m.content}</div>
        ))}
        {busy && <div className="bubble assistant muted">…</div>}
        <div ref={endRef} />
      </div>
      <form className="chat-in" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Сообщение…" />
        <button className="btn round" type="submit">↑</button>
      </form>
    </div>
  );
}
