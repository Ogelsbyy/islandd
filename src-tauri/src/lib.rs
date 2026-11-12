use serde::{Deserialize, Serialize};
use std::process::Command;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, LogicalSize, Manager, PhysicalPosition, WebviewWindow};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// ---------- helpers ----------

fn powershell(script: &str) -> Result<String, String> {
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-STA",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let out = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if out.status.success() {
        Ok(stdout)
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if err.is_empty() { stdout } else { err })
    }
}

fn place_window(window: &WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let scale = monitor.scale_factor();
        let mpos = monitor.position();
        let msize = monitor.size();
        let w_px = (width * scale) as i32;
        let x = mpos.x + (msize.width as i32 - w_px) / 2;
        let y = mpos.y + (8.0 * scale) as i32;
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------- commands ----------

#[tauri::command]
fn set_island_size(window: WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    place_window(&window, width, height)
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
async fn http_get(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("Island/0.1")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    resp.text().await.map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct ShellResult {
    stdout: String,
    stderr: String,
    code: i32,
}

#[tauri::command]
async fn run_shell(command: String, cwd: Option<String>) -> Result<ShellResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        let mut cmd = {
            let mut c = Command::new("powershell");
            c.args(["-NoProfile", "-NonInteractive", "-Command", &command]);
            c.creation_flags(CREATE_NO_WINDOW);
            c
        };
        #[cfg(not(windows))]
        let mut cmd = {
            let mut c = Command::new("sh");
            c.args(["-c", &command]);
            c
        };
        if let Some(dir) = cwd {
            if !dir.trim().is_empty() {
                cmd.current_dir(dir);
            }
        }
        let out = cmd.output().map_err(|e| e.to_string())?;
        Ok(ShellResult {
            stdout: String::from_utf8_lossy(&out.stdout).to_string(),
            stderr: String::from_utf8_lossy(&out.stderr).to_string(),
            code: out.status.code().unwrap_or(-1),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Full-screen screenshot: saved to Pictures\Island and copied to clipboard.
/// Returns "path|width|height".
#[tauri::command]
async fn take_screenshot() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let script = r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
$dir = Join-Path ([Environment]::GetFolderPath('MyPictures')) 'Island'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$path = Join-Path $dir ("screenshot-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".png")
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
[System.Windows.Forms.Clipboard]::SetImage($bmp)
Write-Output ($path + '|' + $b.Width + '|' + $b.Height)
$g.Dispose(); $bmp.Dispose()
"#;
        powershell(script)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Current media session (Windows SMTC) as JSON: {title,artist,playing,pos,dur} or {}.
#[tauri::command]
async fn media_info() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let script = r#"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $t) { $m = $asTask.MakeGenericMethod($t); $task = $m.Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$mgr = Await ($mgrType::RequestAsync()) $mgrType
$s = $mgr.GetCurrentSession()
if (-not $s) { Write-Output '{}'; exit }
$propType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$p = Await ($s.TryGetMediaPropertiesAsync()) $propType
$pb = $s.GetPlaybackInfo()
$tl = $s.GetTimelineProperties()
@{ title = $p.Title; artist = $p.Artist; playing = ([int]$pb.PlaybackStatus -eq 4); pos = $tl.Position.TotalSeconds; dur = $tl.EndTime.TotalSeconds } | ConvertTo-Json -Compress
"#;
        powershell(script)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// action: play_pause | next | prev | vol_up | vol_down | mute
#[tauri::command]
async fn media_key(action: String) -> Result<(), String> {
    let vk = match action.as_str() {
        "play_pause" => 0xB3,
        "next" => 0xB0,
        "prev" => 0xB1,
        "mute" => 0xAD,
        "vol_down" => 0xAE,
        "vol_up" => 0xAF,
        _ => return Err("unknown action".into()),
    };
    // volume keys move by 2%, press a few times for a perceptible step
    let repeat = if action == "vol_up" || action == "vol_down" { 3 } else { 1 };
    tauri::async_runtime::spawn_blocking(move || {
        let script = format!(
            "Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e);' -Name K -Namespace W; 1..{} | ForEach-Object {{ [W.K]::keybd_event({}, 0, 0, [UIntPtr]::Zero); [W.K]::keybd_event({}, 0, 2, [UIntPtr]::Zero) }}",
            repeat, vk, vk
        );
        powershell(&script).map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize, Serialize, Clone)]
struct ChatMsg {
    role: String, // "user" | "assistant"
    content: String,
}

#[tauri::command]
async fn ai_chat(
    provider: String,
    api_key: String,
    model: String,
    messages: Vec<ChatMsg>,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("Укажи API-ключ в настройках".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;

    if provider == "gemini" {
        let model = if model.trim().is_empty() { "gemini-2.5-flash".to_string() } else { model };
        let contents: Vec<serde_json::Value> = messages
            .iter()
            .map(|m| {
                serde_json::json!({
                    "role": if m.role == "assistant" { "model" } else { "user" },
                    "parts": [{ "text": m.content }]
                })
            })
            .collect();
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            model
        );
        let resp = client
            .post(url)
            .header("x-goog-api-key", api_key.trim())
            .json(&serde_json::json!({ "contents": contents }))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = resp.status();
        let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            return Err(v["error"]["message"].as_str().unwrap_or("Ошибка Gemini").to_string());
        }
        Ok(v["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("(пустой ответ)")
            .to_string())
    } else {
        let model = if model.trim().is_empty() { "deepseek-chat".to_string() } else { model };
        let resp = client
            .post("https://api.deepseek.com/chat/completions")
            .bearer_auth(api_key.trim())
            .json(&serde_json::json!({ "model": model, "messages": messages, "stream": false }))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = resp.status();
        let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            return Err(v["error"]["message"].as_str().unwrap_or("Ошибка DeepSeek").to_string());
        }
        Ok(v["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("(пустой ответ)")
            .to_string())
    }
}

// ---------- clipboard watcher ----------

#[derive(Serialize, Clone)]
struct ClipEvent {
    kind: String,
    text: String,
    width: usize,
    height: usize,
}

fn start_clipboard_watcher(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut cb = match arboard::Clipboard::new() {
            Ok(c) => c,
            Err(_) => return,
        };
        let mut last_text = String::new();
        let mut last_img: (usize, usize, usize) = (0, 0, 0);
        loop {
            std::thread::sleep(Duration::from_millis(900));
            if let Ok(t) = cb.get_text() {
                if !t.is_empty() && t != last_text {
                    last_text = t.clone();
                    last_img = (0, 0, 0);
                    let _ = app.emit(
                        "clipboard",
                        ClipEvent { kind: "text".into(), text: t, width: 0, height: 0 },
                    );
                }
                continue;
            }
            if let Ok(img) = cb.get_image() {
                let sig = (img.width, img.height, img.bytes.len());
                if sig != last_img {
                    last_img = sig;
                    last_text.clear();
                    let _ = app.emit(
                        "clipboard",
                        ClipEvent {
                            kind: "image".into(),
                            text: String::new(),
                            width: img.width,
                            height: img.height,
                        },
                    );
                }
            }
        }
    });
}

// ---------- entry ----------

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            set_island_size,
            quit_app,
            copy_text,
            http_get,
            run_shell,
            take_screenshot,
            media_info,
            media_key,
            ai_chat
        ])
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = place_window(&win, 240.0, 48.0);
            }

            let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            start_clipboard_watcher(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Island");
}
