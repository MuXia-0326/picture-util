use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{Read, Write},
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

const MAX_FRAME: usize = 64 * 1024;
const MAX_OUTPUT: usize = 32 * 1024 * 1024;
type Children = Arc<Mutex<HashMap<u32, CommandChild>>>;

#[derive(Default)]
struct BackendState {
    organizing: Arc<AtomicBool>,
    active: Arc<AtomicUsize>,
    children: Children,
    config_lock: tokio::sync::Mutex<()>,
}

struct JobGuard(Arc<AtomicBool>);
impl Drop for JobGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

struct ProcessGuard {
    pid: u32,
    children: Children,
    active: Arc<AtomicUsize>,
}
impl Drop for ProcessGuard {
    fn drop(&mut self) {
        let child = self
            .children
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.pid);
        if let Some(child) = child {
            let _ = child.kill();
        }
        self.active.fetch_sub(1, Ordering::SeqCst);
    }
}

fn failure(message: impl Into<String>) -> Value {
    json!({ "success": false, "error": message.into() })
}

fn default_config() -> Value {
    json!({
        "db": { "host": "localhost", "port": 3306, "user": "root", "password": "", "database": "image_organizer" },
        "snowflake": { "workerId": 1, "datacenterId": 1 },
        "paths": { "sourceDir": "", "targetDir": "" },
        "categories": { "categoryA": { "name": "CategoryA", "regex": "" }, "categoryB": { "name": "CategoryB", "regex": "" }, "default": "Other" }
    })
}

fn read_config(path: &Path) -> Result<Option<Value>, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("无法读取配置文件，请检查访问权限".into()),
    };
    let mut bytes = Vec::new();
    file.take((MAX_FRAME + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "配置文件读取失败")?;
    if bytes.len() > MAX_FRAME {
        return Err("配置文件过大，原文件未被覆盖".into());
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| "配置文件损坏，请备份并修复原文件后重试".into())
}

fn write_config(path: &Path, config: &Value, import_only: bool) -> Result<(), String> {
    let parent = path.parent().ok_or("配置目录无效")?;
    fs::create_dir_all(parent).map_err(|_| "无法创建配置目录")?;
    let bytes = serde_json::to_vec_pretty(config).map_err(|_| "配置序列化失败")?;
    if bytes.len() > MAX_FRAME {
        return Err("配置超出大小限制".into());
    }
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|_| "无法创建配置临时文件")?;
    file.write_all(&bytes).map_err(|_| "写入配置失败")?;
    file.as_file().sync_all().map_err(|_| "同步配置失败")?;
    if import_only {
        file.persist_noclobber(path)
            .map_err(|_| "导入配置失败，现有文件未被覆盖")?;
    } else {
        file.persist(path)
            .map_err(|_| "保存配置失败，原文件未被覆盖")?;
    }
    Ok(())
}

fn consume_frame(
    app: &AppHandle,
    bytes: &[u8],
    organize: bool,
    result: &mut Option<Value>,
) -> Result<(), String> {
    let frame: Value = serde_json::from_slice(bytes).map_err(|_| "工作进程返回无效 JSON")?;
    if result.is_some() {
        return Err("工作进程在结果之后继续输出".into());
    }
    match frame.get("kind").and_then(Value::as_str) {
        Some("progress") if organize => {
            let progress = frame.get("progress").ok_or("工作进程进度格式无效")?;
            let kind = progress
                .get("type")
                .and_then(Value::as_str)
                .ok_or("工作进程进度类型无效")?;
            let message = progress
                .get("message")
                .and_then(Value::as_str)
                .ok_or("工作进程进度内容无效")?;
            if !["info", "success", "warning", "error"].contains(&kind) || message.len() > 16384 {
                return Err("工作进程进度超出限制".into());
            }
            let mut event = json!({ "type": kind, "message": message });
            if let Some(stage) = progress.get("stage").and_then(Value::as_str) {
                if stage.len() > 64 {
                    return Err("工作进程阶段超出限制".into());
                }
                event["stage"] = json!(stage);
            }
            for key in ["count", "total"] {
                if let Some(count) = progress.get(key).and_then(Value::as_u64) {
                    event[key] = json!(count);
                }
            }
            app.emit_to("main", "organize-progress", event)
                .map_err(|_| "发送整理进度失败")?;
        }
        Some("result") => {
            let value = frame.get("result").ok_or("工作进程缺少结果")?;
            if value.get("success").and_then(Value::as_bool).is_none() {
                return Err("工作进程结果格式无效".into());
            }
            *result = Some(value.clone());
        }
        _ => return Err("工作进程返回未知协议消息".into()),
    }
    Ok(())
}

async fn worker(app: &AppHandle, request: Value, organize: bool) -> Result<Value, String> {
    let mut input = serde_json::to_vec(&request).map_err(|_| "请求序列化失败")?;
    input.push(b'\n');
    if input.len() > MAX_FRAME {
        return Err("请求超出大小限制".into());
    }
    let state = app.state::<BackendState>();
    if state.active.fetch_add(1, Ordering::SeqCst) >= 4 {
        state.active.fetch_sub(1, Ordering::SeqCst);
        return Err("后台请求过多，请稍后重试".into());
    }
    let command = match app.shell().sidecar("image-worker") {
        Ok(command) => command,
        Err(_) => {
            state.active.fetch_sub(1, Ordering::SeqCst);
            return Err("找不到图片工作进程，请重新打包应用".into());
        }
    };
    let spawned = command
        .set_raw_out(true)
        .set_process_group(true)
        .kill_on_drop(true)
        .env("DEBUG", "false")
        .spawn();
    let (mut rx, mut child) = match spawned {
        Ok(pair) => pair,
        Err(_) => {
            state.active.fetch_sub(1, Ordering::SeqCst);
            return Err("无法启动图片工作进程".into());
        }
    };
    let pid = child.pid();
    // 凭据仅通过标准输入传递，不出现在命令行参数或诊断输出中
    if child.write(&input).is_err() {
        let _ = child.kill();
        state.active.fetch_sub(1, Ordering::SeqCst);
        return Err("无法发送工作进程请求".into());
    }
    state
        .children
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(pid, child);
    let _guard = ProcessGuard {
        pid,
        children: state.children.clone(),
        active: state.active.clone(),
    };
    let seconds = if organize {
        12 * 60 * 60
    } else if request["operation"] == "validate" {
        20
    } else {
        60
    };
    let execution = async {
        let mut pending = Vec::new();
        let mut total = 0usize;
        let mut result = None;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    total += bytes.len();
                    if total > MAX_OUTPUT {
                        return Err("工作进程输出超出限制".into());
                    }
                    for byte in bytes {
                        if byte == b'\n' {
                            if pending.last() == Some(&b'\r') {
                                pending.pop();
                            }
                            consume_frame(app, &pending, organize, &mut result)?;
                            pending.clear();
                        } else {
                            pending.push(byte);
                            if pending.len() > MAX_FRAME {
                                return Err("工作进程单条消息超出限制".into());
                            }
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    // 丢弃诊断内容，避免数据库错误或凭据意外进入前端
                    total += bytes.len();
                    if total > MAX_OUTPUT {
                        return Err("工作进程诊断输出超出限制".into());
                    }
                }
                CommandEvent::Error(_) => return Err("工作进程通信失败".into()),
                CommandEvent::Terminated(status) => {
                    if status.code != Some(0) {
                        return Err("工作进程异常退出，源文件不会在入库前删除".into());
                    }
                    if !pending.is_empty() {
                        return Err("工作进程返回不完整消息".into());
                    }
                    return result.ok_or_else(|| "工作进程未返回结果".into());
                }
                _ => {}
            }
        }
        Err("工作进程连接意外关闭".into())
    };
    tokio::time::timeout(Duration::from_secs(seconds), execution)
        .await
        .map_err(|_| "工作进程超时，已终止子进程".to_string())?
}

async fn validate(app: &AppHandle, config: &Value) -> Result<(), String> {
    let result = worker(
        app,
        json!({ "operation": "validate", "config": config }),
        false,
    )
    .await?;
    if result["success"] != true {
        return Err(result["error"].as_str().unwrap_or("配置无效").to_owned());
    }
    Ok(())
}

#[tauri::command]
async fn load_config(app: AppHandle, state: State<'_, BackendState>) -> Result<Value, String> {
    let _lock = state.config_lock.lock().await;
    let current = app
        .path()
        .app_config_dir()
        .map_err(|_| "无法确定配置目录")?
        .join("config.json");
    if let Some(config) = read_config(&current)? {
        validate(&app, &config)
            .await
            .map_err(|error| format!("现有配置无效，原文件未被覆盖: {error}"))?;
        return Ok(config);
    }
    let legacy = app
        .path()
        .config_dir()
        .map_err(|_| "无法确定旧配置目录")?
        .join("image-organizer")
        .join("config.json");
    if let Some(config) = read_config(&legacy)? {
        validate(&app, &config)
            .await
            .map_err(|error| format!("旧版配置无效，请修复后重试: {error}"))?;
        write_config(&current, &config, true)?;
        return Ok(config);
    }
    Ok(default_config())
}

#[tauri::command]
async fn save_config(
    app: AppHandle,
    state: State<'_, BackendState>,
    config: Value,
) -> Result<Value, String> {
    let _lock = state.config_lock.lock().await;
    let save = async {
        let path = app
            .path()
            .app_config_dir()
            .map_err(|_| "无法确定配置目录")?
            .join("config.json");
        // 已有配置损坏时拒绝覆盖，必须由用户先备份和修复
        if let Some(existing) = read_config(&path)? {
            validate(&app, &existing).await?;
        }
        validate(&app, &config).await?;
        write_config(&path, &config, false)
    }
    .await;
    Ok(match save {
        Ok(()) => json!({ "success": true }),
        Err(error) => failure(error),
    })
}

#[tauri::command]
async fn select_directory(app: AppHandle, title: Option<String>) -> Result<Option<String>, String> {
    let title = title.unwrap_or_else(|| "选择文件夹".into());
    if title.len() > 256 {
        return Err("对话框标题过长".into());
    }
    let mut dialog = app.dialog().file().set_title(title);
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    dialog
        .blocking_pick_folder()
        .map(|folder| {
            folder
                .into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|_| "目录路径无效".into())
        })
        .transpose()
}

#[tauri::command]
async fn organize_images(
    app: AppHandle,
    state: State<'_, BackendState>,
    options: Value,
) -> Result<Value, String> {
    if state
        .organizing
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(failure("已有整理任务正在运行"));
    }
    let _guard = JobGuard(state.organizing.clone());
    Ok(
        match worker(
            &app,
            json!({ "operation": "organize", "options": options }),
            true,
        )
        .await
        {
            Ok(result) => result,
            Err(error) => {
                let _ = app.emit_to(
                    "main",
                    "organize-progress",
                    json!({ "type": "error", "message": &error }),
                );
                failure(error)
            }
        },
    )
}

#[tauri::command]
async fn get_stats(app: AppHandle, config: Value) -> Value {
    match worker(
        &app,
        json!({ "operation": "stats", "config": config }),
        false,
    )
    .await
    {
        Ok(result) => result,
        Err(error) => failure(error),
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(BackendState::default())
        .invoke_handler(tauri::generate_handler![load_config, save_config, select_directory, organize_images, get_stats])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<BackendState>();
                if state.organizing.load(Ordering::SeqCst) || state.active.load(Ordering::SeqCst) > 0 {
                    api.prevent_close();
                    let _ = window.emit("organize-progress", json!({ "type": "warning", "message": "后台任务正在运行，请等待完成后再关闭窗口" }));
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("无法启动图片整理工具");
    app.run(|app, event| {
        let state = app.state::<BackendState>();
        match event {
            RunEvent::ExitRequested { api, .. }
                if state.organizing.load(Ordering::SeqCst)
                    || state.active.load(Ordering::SeqCst) > 0 =>
            {
                api.prevent_exit()
            }
            RunEvent::Exit => {
                let children: Vec<_> = state
                    .children
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .drain()
                    .map(|(_, child)| child)
                    .collect();
                for child in children {
                    let _ = child.kill();
                }
            }
            _ => {}
        }
    });
}
