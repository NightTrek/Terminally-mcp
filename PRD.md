# Terminally MCP — Product Requirements Document (PRD)

Version: 1.0  
Date: 2025-09-06

Summary:
Terminally MCP is an MCP server that gives AI agents safe, reliable terminal control via tmux. It must provide robust tab management, reliable bounded command execution, durable log access, and clear MCP tool schemas. This PRD consolidates goals, the API structure, usage scenarios, and a prioritized P0–P3 plan to make the server production-ready.

Documentation Identified:
- README.md (repository root) — features, quick start, API overview, examples, architecture.
- docs/PLANNING.md — finalized first-principles API and architecture, detailed TDD plan and phased roadmap.

1) Product Goals
- Reliable terminal control for agents:
  - Create and manage multiple tabs (tmux windows).
  - Execute commands with strict, bounded capture semantics.
  - Start/stop long-running processes without blocking the agent.
  - Read recent logs and history efficiently and durably.
- Safety and isolation:
  - Use a dedicated tmux server/socket per MCP instance to avoid interfering with user sessions.
  - Avoid shell injection by using spawn(argv) style tmux invocations where applicable.
- Predictable MCP interface:
  - First-principles tool set with clear request/response schemas.
  - “Normal MCP payload” convention: return JSON-stringified results in content type "text".
- Developer-grade ergonomics:
  - TypeScript implementation with strong typing.
  - Comprehensive tests (unit and e2e) and CI-friendly.
  - Tests should be clear and human readable with comments explaining the test case being covered and why
  - Clean error handling and actionable errors for agents.

2) Non‑Goals
- Full security sandboxing or containerization.
- UI-level functionality (pure server behavior only).
- Windows cmd.exe/PowerShell support (macOS/Linux with tmux is the primary target).
- Backward-compatibility with early prototype tool names that conflict with first-principles API (e.g., read_output).

3) Target Users
- AI agents and developer assistants (e.g., Claude Desktop, Cline) needing:
  - Repeatable shell command execution.
  - Durable logs and history inspection.
  - Multi-service workflows managed in separate tabs.

4) Key Requirements

Functional
- Create tabs with optional name, cwd, environment variables, and login shell behavior.
- List all tabs with IDs, names, and active status.
- Read recent logs (last N lines) from pipe-pane output per tab, optionally strip ANSI sequences.
- Execute a command synchronously with START/END markers to capture only the produced output; include exit_code and timeout behavior.
- Start a long-running process (non-blocking) and stop it gracefully (SIGINT by default).
- Optional: Stream logs by byte offsets for durable chunked reading across restarts.
- Optional: Set history-limit on session.

Reliability and performance
- Unique tmux socket per server; single managed session created at startup.
- Per-pane mutex/serialization to avoid interleaving of command sequences.
- High but bounded history-limit for panes.
- Timeout protection on bounded execute.
- Durable pipe-pane logs that persist across server restarts.

Compatibility
- Node.js 16+ (prefer 18+).
- tmux installed (macOS/Linux).
- Works under login shells (zsh -l) when needed to load user environment (nvm, pyenv, PATH).

MCP Payload Convention
- Results returned as content: [{ type: "text", text: JSON.stringify(result) }].

5) API Structure (MCP Tools)

Tool: create_tab
- Description: Create a new terminal tab (tmux window).
- Request schema:
  {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "Optional name" },
      "cwd": { "type": "string", "description": "Optional working directory" },
      "env": { "type": "object", "additionalProperties": { "type": "string" }, "description": "Optional environment variables" },
      "login": { "type": "boolean", "description": "Use login shell (e.g., zsh -l)" }
    },
    "required": []
  }
- Response schema:
  {
    "type": "object",
    "properties": {
      "window_id": { "type": "string", "description": "tmux window id, e.g., '@3'" },
      "name": { "type": "string" }
    },
    "required": ["window_id"]
  }

Tool: list_tabs
- Description: List all terminal tabs.
- Request schema:
  { "type": "object", "properties": {}, "required": [] }
- Response schema:
  {
    "type": "object",
    "properties": {
      "tabs": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "window_id": { "type": "string" },
            "name": { "type": "string" },
            "active": { "type": "boolean" }
          },
          "required": ["window_id", "name", "active"]
        }
      }
    },
    "required": ["tabs"]
  }

Tool: read_logs_from_tab
- Description: Read recent logs from a tab’s pipe-pane file (line-count oriented).
- Request schema:
  {
    "type": "object",
    "properties": {
      "window_id": { "type": "string" },
      "lines": { "type": "number", "description": "Lines from end (default 500)" },
      "strip_ansi": { "type": "boolean", "description": "Remove ANSI sequences (default false)" }
    },
    "required": ["window_id"]
  }
- Response schema:
  {
    "type": "object",
    "properties": {
      "content": { "type": "string" },
      "returned_lines": { "type": "number" },
      "truncated": { "type": "boolean", "description": "True if more lines existed than returned" }
    },
    "required": ["content"]
  }

Tool: execute_command
- Description: Execute a command in a tab and return only the output produced between START/END markers.
- Request schema:
  {
    "type": "object",
    "properties": {
      "window_id": { "type": "string" },
      "command": { "type": "string" },
      "timeout_ms": { "type": "number", "description": "Max wait for END marker; default 10000" },
      "strip_ansi": { "type": "boolean", "description": "Strip ANSI sequences (default false)" }
    },
    "required": ["window_id", "command"]
  }
- Response schema:
  {
    "type": "object",
    "properties": {
      "output": { "type": "string" },
      "exit_code": { "type": "number" },
      "timed_out": { "type": "boolean" }
    },
    "required": ["output"]
  }

Tool: start_process
- Description: Start a long-running process; returns immediately; logs stream to pipe-pane.
- Request schema:
  {
    "type": "object",
    "properties": {
      "window_id": { "type": "string" },
      "command": { "type": "string" },
      "append_newline": { "type": "boolean", "description": "Send Enter after typing command (default true)" }
    },
    "required": ["window_id", "command"]
  }
- Response schema:
  {
    "type": "object",
    "properties": { "started": { "type": "boolean" } },
    "required": ["started"]
  }

Tool: stop_process
- Description: Gracefully stop foreground process in given tab.
- Request schema:
  {
    "type": "object",
    "properties": {
      "window_id": { "type": "string" },
      "signal": { "type": "string", "description": "One of SIGINT|SIGTERM; default SIGINT via C-c" }
    },
    "required": ["window_id"]
  }
- Response schema:
  {
    "type": "object",
    "properties": { "success": { "type": "boolean" } },
    "required": ["success"]
  }

Optional: stream_logs_from_tab
- Description: Read logs by byte offsets for durable consumption.
- Request schema:
  {
    "type": "object",
    "properties": {
      "window_id": { "type": "string" },
      "from_byte": { "type": "number", "description": "Start offset (default 0)" },
      "max_bytes": { "type": "number", "description": "Max bytes to read (default 65536)" },
      "strip_ansi": { "type": "boolean", "description": "Strip ANSI sequences (default false)" }
    },
    "required": ["window_id"]
  }
- Response schema:
  {
    "type": "object",
    "properties": {
      "chunk": { "type": "string" },
      "next_byte": { "type": "number" },
      "eof": { "type": "boolean" }
    },
    "required": ["chunk", "next_byte"]
  }

Notes on API deltas vs README:
- README mentions read_output and close_tab. The first-principles API supersedes read_output with read_logs_from_tab and does not expose close_tab as a top-level tool by default. If needed, close_tab can be added later as a P2/P3 enhancement. README should be updated accordingly.

6) Usage Scenarios

Scenario A: Quick bounded command execution
- create_tab → execute_command(window_id, "ls -la", timeout_ms: 5000) → read_logs_from_tab for recent context if needed.

Scenario B: Start a dev server and monitor logs
- create_tab(name: "web")
- start_process(window_id, "pnpm dev")
- Periodically call read_logs_from_tab(window_id, lines: 500, strip_ansi: true)
- stop_process(window_id) to stop when done

Scenario C: Multi-service orchestration
- create_tab("web"), create_tab("db"), create_tab("tests")
- start_process(web, "pnpm dev"), start_process(db, "docker compose up postgres")
- execute_command(tests, "pnpm test", timeout_ms: 120000)
- read_logs_from_tab on each to summarize status

Scenario D: Investigate a failure
- read_logs_from_tab(window_id, lines: 2000) to pull history quickly
- execute_command(window_id, "grep -i error app.log", timeout_ms: 10000)

7) Architecture and Behavior Notes (must-haves)
- Isolated tmux server/socket per MCP server instance.
- One managed session; windows represent tabs; use stable tmux window IDs (e.g., "@1").
- Pipe-pane logging: enable pipe-pane per pane to append to a per-pane log file under a managed temp directory.
- Bounded execute: insert START/END markers, capture only in-between output, include exit_code and timed_out.
- Per-pane mutex to serialize send-keys/exec interactions and avoid output interleaving.
- Default shell from $SHELL; option for login shell per tab; support cwd/env overrides.
- History-limit configured high but bounded.

8) Acceptance Criteria / Success Metrics
- Functional tools are exposed exactly as defined above via MCP tools/list.
- End-to-end tests pass for:
  - create_tab, list_tabs with names incl. spaces and correct active flag.
  - read_logs_from_tab returning exact N lines with truncated flag behavior.
  - execute_command slicing strictly between markers, with correct exit_code/timeout.
  - start/stop process lifecycle with durable logs across restarts.
- README reflects first-principles tools and examples; no discrepancies remain.
- No interference with user’s tmux sessions (unique socket).
- Robust error messages for missing tmux, invalid window_id, timeouts.

9) Priority Plan (P0–P3)

P0 (Must-have for production viability)
- Align server to first-principles API: create_tab, list_tabs, read_logs_from_tab, execute_command, start_process, stop_process.
- Unique tmux socket/session isolation.
- Pipe-pane logging per pane with durable files.
- START/END marker-based bounded execute; timeout and ANSI strip options.
- Per-pane mutex to prevent interleaving.
- tools/list reflects accurate input schemas (inputSchema) and MCP “normal payload” responses.
- Core e2e and unit tests passing in CI; basic error handling.

P1 (High-value enhancements)
- Optional stream_logs_from_tab (byte-offset streaming).
- Configurable history-limit tool; default reasonable limit on startup.
- Login shell option wired through tab creation; cwd/env per call thoroughly tested.
- README and examples fully updated; remove or deprecate read_output/close_tab mentions.
- Strip ANSI helper correctness and toggle verified.

P2 (Quality and operability)
- Log file rotation (size/time-based) and retention guidance.
- Better diagnostics (e.g., tmux version check, environment reporting).
- Cross-distro hardening (Linux shell variations), improved timeouts, and resilience under load.

P3 (Advanced/optional)
- close_tab tool (if required by clients), with safe process termination semantics.
- Attach to existing tmux session (advanced, off-by-default).
- Resource quotas (per-pane concurrency limits), telemetry hooks.

10) Open Questions / Risks
- Do we need a formal close_tab tool now or rely on session lifecycle? (Default: defer; add at P2/P3.)
- How strict should ANSI stripping be (perf vs completeness)? Default: optional toggle; rely on a robust library/regex.
- Log rotation strategy (size thresholds and retention) timeline: propose P2.

11) Implementation Guidance (from docs/PLANNING.md)
- Use spawn(argv) for tmux; always target -t "@ID".
- Atomic window creation with new-window -P -F "#{window_id}".
- Tab-parsing using tab-delimited formats to handle names with spaces.
- START/END markers constructed uniquely (UUID), capture-pane -J, strict slicing.
- Maintain per-pane mutex/queue; avoid clearing panes by default.
- “Normal MCP payload”: content: [{ type: "text", text: JSON.stringify(result) }].
