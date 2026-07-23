use serde::Serialize;
use serde_json::{json, Value};
use std::env;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use tauri::{AppHandle, Manager};

const ALLOWED_TOOLS: &[&str] = &[
    "create_player_profile",
    "get_player_profile",
    "list_player_profiles",
    "get_player_stats",
    "refresh_player_stats",
    "update_player_preferences",
    "export_player_profile",
    "import_player_profile",
    "calculate_xp_remaining",
    "get_skill_progress",
    "get_item_price",
    "search_items",
    "get_item_details",
    "get_item_price_history",
    "get_item_buy_limit",
    "get_item_alchemy_value",
    "get_item_price_summary",
    "compare_item_prices",
    "value_item_list",
    "value_equipment_setup",
    "calculate_quest_shopping_cost",
    "calculate_training_cost",
    "export_price_data",
    "refresh_price_data",
    "get_price_data_status",
    "search_quests",
    "get_quest",
    "get_quest_requirements",
    "get_quest_rewards",
    "get_quest_source",
    "set_quest_status",
    "set_multiple_quest_statuses",
    "list_available_quests",
    "list_missing_quest_requirements",
    "create_quest_route",
    "create_quest_shopping_list",
    "refresh_quest_data",
    "get_quest_data_status",
    "list_training_methods",
    "get_training_method",
    "compare_training_methods",
    "create_levelling_plan",
    "create_weekly_goal_plan",
    "estimate_time_to_level",
    "estimate_cost_to_level",
    "compare_quest_xp_rewards",
    "refresh_training_data",
    "get_training_data_status",
];
const MAX_ARGUMENT_BYTES: usize = 256 * 1024;

#[derive(Debug)]
enum BridgeError {
    RuntimeUnavailable,
    StartupFailed,
    ProtocolFailed,
    ToolFailed(String),
}

impl BridgeError {
    fn public_message(&self) -> String {
        match self {
            Self::RuntimeUnavailable => {
                "The local companion runtime is unavailable. Reinstall the app or use Settings to check the runtime.".into()
            }
            Self::StartupFailed => {
                "The local companion runtime could not start. Check Data-source status and local logs.".into()
            }
            Self::ProtocolFailed => {
                "The local companion returned an invalid response. Restart the app and try again.".into()
            }
            Self::ToolFailed(message) => message.clone(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeStatus {
    ready: bool,
    mode: &'static str,
    message: String,
}

struct RuntimeCommand {
    executable: PathBuf,
    entry: PathBuf,
    mode: &'static str,
}

fn is_allowed_tool(tool: &str) -> bool {
    ALLOWED_TOOLS.contains(&tool)
}

fn development_entry() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../mcp-server/dist/index.js")
}

fn bundled_executable() -> Option<PathBuf> {
    let directory = env::current_exe().ok()?.parent()?.to_path_buf();
    let exact = directory.join(if cfg!(windows) {
        "gielinor-runtime.exe"
    } else {
        "gielinor-runtime"
    });
    if exact.is_file() {
        return Some(exact);
    }
    std::fs::read_dir(directory)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("gielinor-runtime"))
                && path.is_file()
        })
}

fn resolve_runtime(app: &AppHandle) -> Result<RuntimeCommand, BridgeError> {
    if let (Ok(executable), Ok(entry)) = (
        env::var("GIELINOR_DESKTOP_RUNTIME"),
        env::var("GIELINOR_DESKTOP_MCP_ENTRY"),
    ) {
        let executable = PathBuf::from(executable);
        let entry = PathBuf::from(entry);
        if executable.is_file() && entry.is_file() {
            return Ok(RuntimeCommand {
                executable,
                entry,
                mode: "configured",
            });
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let entry = resource_dir.join("runtime/dist/index.js");
        if let Some(executable) = bundled_executable().filter(|_| entry.is_file()) {
            return Ok(RuntimeCommand {
                executable,
                entry,
                mode: "bundled",
            });
        }
    }

    let entry = development_entry();
    if entry.is_file() {
        return Ok(RuntimeCommand {
            executable: PathBuf::from(if cfg!(windows) { "node.exe" } else { "node" }),
            entry,
            mode: "development",
        });
    }
    Err(BridgeError::RuntimeUnavailable)
}

fn write_message(stdin: &mut impl Write, message: &Value) -> Result<(), BridgeError> {
    serde_json::to_writer(&mut *stdin, message).map_err(|_| BridgeError::ProtocolFailed)?;
    stdin
        .write_all(b"\n")
        .map_err(|_| BridgeError::ProtocolFailed)?;
    stdin.flush().map_err(|_| BridgeError::ProtocolFailed)
}

fn read_response(reader: &mut impl BufRead, expected_id: u64) -> Result<Value, BridgeError> {
    let mut line = String::new();
    loop {
        line.clear();
        let bytes = reader
            .read_line(&mut line)
            .map_err(|_| BridgeError::ProtocolFailed)?;
        if bytes == 0 {
            return Err(BridgeError::ProtocolFailed);
        }
        let value: Value =
            serde_json::from_str(line.trim()).map_err(|_| BridgeError::ProtocolFailed)?;
        if value.get("id").and_then(Value::as_u64) == Some(expected_id) {
            return Ok(value);
        }
    }
}

fn stop_child(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn invoke_tool(
    runtime: RuntimeCommand,
    tool: &str,
    arguments: Value,
) -> Result<Value, BridgeError> {
    let mut child = Command::new(&runtime.executable)
        .arg(&runtime.entry)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| BridgeError::StartupFailed)?;
    let mut stdin = child.stdin.take().ok_or(BridgeError::StartupFailed)?;
    let stdout = child.stdout.take().ok_or(BridgeError::StartupFailed)?;
    let mut reader = BufReader::new(stdout);

    let result = (|| {
        write_message(
            &mut stdin,
            &json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {
                        "name": "gielinor-companion-desktop",
                        "version": "0.7.0"
                    }
                }
            }),
        )?;
        let initialized = read_response(&mut reader, 1)?;
        if initialized.get("error").is_some() {
            return Err(BridgeError::ProtocolFailed);
        }
        write_message(
            &mut stdin,
            &json!({
                "jsonrpc": "2.0",
                "method": "notifications/initialized",
                "params": {}
            }),
        )?;
        write_message(
            &mut stdin,
            &json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": tool,
                    "arguments": arguments
                }
            }),
        )?;
        let response = read_response(&mut reader, 2)?;
        if let Some(error) = response.get("error") {
            return Err(BridgeError::ToolFailed(
                error
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("The companion tool failed")
                    .to_string(),
            ));
        }
        let result = response.get("result").ok_or(BridgeError::ProtocolFailed)?;
        if result.get("isError").and_then(Value::as_bool) == Some(true) {
            let text = result
                .get("content")
                .and_then(Value::as_array)
                .and_then(|content| content.first())
                .and_then(|block| block.get("text"))
                .and_then(Value::as_str)
                .unwrap_or("The companion tool failed");
            let message = serde_json::from_str::<Value>(text)
                .ok()
                .and_then(|value| {
                    value
                        .get("error")
                        .and_then(|error| error.get("message"))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .unwrap_or_else(|| "The companion tool failed".to_string());
            return Err(BridgeError::ToolFailed(message));
        }
        result
            .get("structuredContent")
            .cloned()
            .ok_or(BridgeError::ProtocolFailed)
    })();
    stop_child(&mut child);
    result
}

#[tauri::command]
async fn desktop_runtime_status(app: AppHandle) -> RuntimeStatus {
    match resolve_runtime(&app) {
        Ok(runtime) => RuntimeStatus {
            ready: true,
            mode: runtime.mode,
            message: "Local deterministic companion runtime is ready.".into(),
        },
        Err(error) => RuntimeStatus {
            ready: false,
            mode: "unavailable",
            message: error.public_message(),
        },
    }
}

#[tauri::command]
async fn call_companion_tool(
    app: AppHandle,
    tool: String,
    arguments: Value,
) -> Result<Value, String> {
    if !is_allowed_tool(&tool) {
        return Err("That companion capability is not available in this desktop release.".into());
    }
    if !arguments.is_object()
        || serde_json::to_vec(&arguments)
            .map(|encoded| encoded.len() > MAX_ARGUMENT_BYTES)
            .unwrap_or(true)
    {
        return Err("The companion arguments are not a valid bounded object.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = resolve_runtime(&app)?;
        invoke_tool(runtime, &tool, arguments)
    })
    .await
    .map_err(|_| "The local companion task stopped unexpectedly.".to_string())?
    .map_err(|error| error.public_message())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_status,
            call_companion_tool
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Gielinor Companion desktop");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restricts_the_bridge_to_documented_tools() {
        assert!(is_allowed_tool("search_items"));
        assert!(is_allowed_tool("create_levelling_plan"));
        assert!(!is_allowed_tool("run_shell_command"));
        assert!(!is_allowed_tool("../mcp-server"));
        assert_eq!(ALLOWED_TOOLS.len(), 48);
    }

    #[test]
    fn public_runtime_errors_never_include_paths_or_process_details() {
        for error in [
            BridgeError::RuntimeUnavailable,
            BridgeError::StartupFailed,
            BridgeError::ProtocolFailed,
        ] {
            let message = error.public_message();
            assert!(!message.contains('\\'));
            assert!(!message.contains("/Users/"));
            assert!(!message.contains("C:"));
        }
    }

    #[test]
    fn native_model_network_scope_is_loopback_only() {
        let capability: Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let permission = capability["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .find(|permission| permission["identifier"] == "http:default")
            .unwrap();
        let allowed: Vec<&str> = permission["allow"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|entry| entry["url"].as_str())
            .collect();

        assert_eq!(
            allowed,
            ["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*"]
        );
        assert!(allowed.iter().all(|url| !url.contains("https://")));
    }

    #[test]
    fn invokes_a_deterministic_mcp_tool_over_stdio() {
        let entry = development_entry();
        assert!(
            entry.is_file(),
            "build @gielinor/mcp-server before running desktop Rust tests"
        );
        let database_path = env::temp_dir().join(format!(
            "gielinor-desktop-command-test-{}.db",
            std::process::id()
        ));
        env::set_var("GIELINOR_DB_PATH", &database_path);
        let result = invoke_tool(
            RuntimeCommand {
                executable: PathBuf::from(if cfg!(windows) { "node.exe" } else { "node" }),
                entry,
                mode: "development",
            },
            "calculate_xp_remaining",
            json!({
                "currentExperience": 0,
                "targetLevel": 10,
                "skillId": "mining"
            }),
        );
        env::remove_var("GIELINOR_DB_PATH");
        let _ = std::fs::remove_file(database_path);
        let response = result.expect("the deterministic MCP tool should return structured content");

        assert_eq!(response["data"]["currentLevel"], 1);
        assert_eq!(response["data"]["targetLevel"], 10);
        assert_eq!(response["data"]["experienceRemaining"], 1_154);
    }
}
