import { useEffect, useRef, useState } from "react";
import { invoke } from "../lib/tauri";

interface Line { kind: "cmd" | "out" | "err"; text: string }
interface ShellResult { stdout: string; stderr: string; code: number }

export default function Terminal({ cwd: startCwd }: { cwd: string }) {
  const [cwd, setCwd] = useState(startCwd);
  const [lines, setLines] = useState<Line[]>([
    { kind: "out", text: "Каждая команда выполняется в PowerShell отдельно (без интерактива)." },
    { kind: "out", text: 'Для Claude Code: claude -p "добавь тёмную тему и отправь на GitHub"' },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const hist = useRef<string[]>([]);
  const hpos = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [lines, busy]);

  const submit = async () => {
    const cmd = text.trim();
    if (!cmd || busy) return;
    hist.current.push(cmd);
    hpos.current = hist.current.length;
    setText("");
    setLines((l) => [...l, { kind: "cmd", text: `${cwd ? cwd + " " : ""}> ${cmd}` }]);
    setBusy(true);
    try {
      const cd = cmd.match(/^cd\s+(.+)$/i);
      const real = cd ? `Set-Location -LiteralPath '${cd[1].replace(/^["']|["']$/g, "").replace(/'/g, "''")}'; (Get-Location).Path` : cmd;
      const r = await invoke<ShellResult>("run_shell", { command: real, cwd });
      if (cd && r.code === 0) {
        setCwd(r.stdout.trim());
      } else {
        const out: Line[] = [];
        if (r.stdout.trim()) out.push({ kind: "out", text: r.stdout.trimEnd() });
        if (r.stderr.trim()) out.push({ kind: "err", text: r.stderr.trimEnd() });
        setLines((l) => [...l, ...out]);
      }
      if (cd && r.code !== 0) setLines((l) => [...l, { kind: "err", text: r.stderr.trim() || "Не удалось сменить папку" }]);
    } catch (e) {
      setLines((l) => [...l, { kind: "err", text: String(e) }]);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" && hist.current.length) {
      e.preventDefault();
      hpos.current = Math.max(0, hpos.current - 1);
      setText(hist.current[hpos.current] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      hpos.current = Math.min(hist.current.length, hpos.current + 1);
      setText(hist.current[hpos.current] ?? "");
    }
  };

  return (
    <div className="term">
      <div className="term-log">
        {lines.map((l, i) => <pre key={i} className={l.kind}>{l.text}</pre>)}
        {busy && <pre className="out">Работаю…</pre>}
        <div ref={endRef} />
      </div>
      <form className="term-in" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <span>›</span>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder="команда" spellCheck={false} autoComplete="off" />
      </form>
    </div>
  );
}
