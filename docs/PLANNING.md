# Terminally MCP — Planning Document

Version: 0.3  
Last Updated: 2025-08-09

Status: Planning finalized for first-principles API and implementation roadmap with TDD. Pipe-pane chosen for logs.

---

## 1) Guiding Principles

- First-principles MCP design: we are not constrained by the current prototype; design APIs for the real needs.
- Simplicity first, durability always: prefer robust, easily testable mechanisms (pipe-pane, file offsets).
- Explicit over implicit: avoid prompt heuristics; use clear markers and precise targeting.
- Non-blocking by default for long-running processes; synchronous command execution remains available for quick tasks.
- Server-only concerns: no UI controls; focus on read/write/edit of terminals and logs via MCP tools.
- “Normal MCP payload”: continue returning content with type "text" and JSON string bodies (SDK default style).
- TDD: write tests first for each phase and feature; CI-ready.

---

## 2) Finalized Architecture

- tmux isolation
  - Unique tmux socket per server instance (e.g., $TMP/terminally-mcp/<uuid>.sock).
  - Single managed session created on startup.
  - Windows represent “tabs”. We standardize on tmux window IDs (@N) as stable handles.

- Process execution
  - Synchronous bounded execution: send command with START/END markers; slice output strictly between markers; optional ANSI stripping.
  - Non-blocking processes: start/stop via key signaling; stdout/stderr observed from pane output.

- Logging (pipe-pane)
  - For each pane, `tmux pipe-pane -o` appends raw bytes to a per-pane log file: $TMP/terminally-mcp/<socket-uuid>/pane-@N.log
  - Logs are durable across server restarts; easy to tail via byte offsets.
  - Primary consumption is line-count oriented (not time-based); optionally support byte offsets for durable streaming when needed.

- Concurrency and reliability
  - Per-pane mutex/queue for send-keys/exec interactions (prevent interleaving).
  - Avoid clearing panes by default; add an explicit flag if needed.
  - All tmux invocations via spawn(argv), not exec strings (no shell quoting issues).
  - Tab-delimited parsing for list commands to handle names with spaces.

- Shell/env
  - Set tmux default-shell to $SHELL; optional login shell (e.g., zsh -l) to load user env (nvm, pyenv, PATH).
  - Optionally accept cwd/env per tool call or tab creation.

- History and limits
  - Configure tmux history-limit high but bounded.
  - Read APIs default to last N lines; large reads supported via offsets.

---

## 3) First-Principles MCP API (Tools and Schemas)

Notes:
- All tool responses are returned as content array with a single entry `{ type: "text", text: JSON.stringify(result) }` to align with “normal MCP payload”.
- We standardize on window identifiers as tmux window IDs (e.g., "@1").
- We are not maintaining backwards compatibility with the prototype tools; this is a clean API.

### 3.1 Tools Overview

- create_tab
- list_tabs
- read_logs_from_tab
- execute_command
- start_process
- stop_process
- (Optional) stream_logs_from_tab
- (Optional) set_history_limit

### 3.2 Tool Schemas (JSON-like)

Tool: create_tab
- description: Create a new terminal tab (tmux window)
- request schema:
  {
    type: "object",
    properties: {
      name: { type: "string", description: "Optional name for the tab" },
      cwd: { type: "string", description: "Optional working directory for the shell" },
      env: { type: "object", additionalProperties: { type: "string" }, description: "Optional environment variables" },
      login: { type: "boolean", description: "Start shell as a login shell (e.g., zsh -l)" }
    },
    required: []
  }
- response schema:
  {
    type: "object",
    properties: {
      window_id: { type: "string", description: "tmux window id, e.g., '@3'" },
      name: { type: "string" }
    },
    required: ["window_id"]
  }

Tool: list_tabs
- description: List all terminal tabs
- request schema:
  { type: "object", properties: {}, required: [] }
- response schema:
  {
    type: "object",
    properties: {
      tabs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            window_id: { type: "string" },
            name: { type: "string" },
            active: { type: "boolean" }
          },
          required: ["window_id", "name", "active"]
        }
      }
    },
    required: ["tabs"]
  }

Tool: read_logs_from_tab
- description: Read recent logs from a tab’s pipe-pane file; line-count oriented (agents prefer this)
- request schema:
  {
    type: "object",
    properties: {
      window_id: { type: "string" },
      lines: { type: "number", description: "Number of lines to return from the end (default 500)" },
      strip_ansi: { type: "boolean", description: "Remove ANSI sequences in returned content (default false)" }
    },
    required: ["window_id"]
  }
- response schema:
  {
    type: "object",
    properties: {
      content: { type: "string" },
      returned_lines: { type: "number" },
      truncated: { type: "boolean", description: "True if more lines existed than returned" }
    },
    required: ["content"]
  }

Tool: execute_command
- description: Execute a command in a tab and return only the output produced between START/END markers
- request schema:
  {
    type: "object",
    properties: {
      window_id: { type: "string" },
      command: { type: "string" },
      timeout_ms: { type: "number", description: "Max wait for END marker; non-zero required for bounded exec (default 10000)" },
      strip_ansi: { type: "boolean", description: "Strip ANSI sequences (default false)" }
    },
    required: ["window_id", "command"]
  }
- response schema:
  {
    type: "object",
    properties: {
      output: { type: "string" },
      exit_code: { type: "number" },
      timed_out: { type: "boolean" }
    },
    required: ["output"]
  }

Tool: start_process
- description: Start a long-running process; returns immediately; logs stream to pipe-pane file (primarily for humans to stream; agents read via read_logs_from_tab)
- request schema:
  {
    type: "object",
    properties: {
      window_id: { type: "string" },
      command: { type: "string" },
      append_newline: { type: "boolean", description: "Append newline (Enter) after typing command (default true)" }
    },
    required: ["window_id", "command"]
  }
- response schema:
  {
    type: "object",
    properties: {
      started: { type: "boolean" }
    },
    required: ["started"]
  }

Tool: stop_process
- description: Gracefully stop foreground process in given tab
- request schema:
  {
    type: "object",
    properties: {
      window_id: { type: "string" },
      signal: { type: "string", description: "One of SIGINT|SIGTERM; default SIGINT via C-c" }
    },
    required: ["window_id"]
  }
- response schema:
  {
    type: "object",
    properties: {
      success: { type: "boolean" }
    },
    required: ["success"]
  }

Optional Tool: stream_logs_from_tab
- description: Read logs by byte offsets for durable consumption (primarily for human streaming; agents typically use read_logs_from_tab)
- request schema:
  {
    type: "object",
    properties: {
      window_id: { type: "string" },
      from_byte: { type: "number", description: "Start offset (default 0)" },
      max_bytes: { type: "number", description: "Max bytes to read (default 65536)" },
      strip_ansi: { type: "boolean", description: "Strip ANSI sequences (default false)" }
    },
    required: ["window_id"]
  }
- response schema:
  {
    type: "object",
    properties: {
      chunk: { type: "string" },
      next_byte: { type: "number" },
      eof: { type: "boolean" }
    },
    required: ["chunk", "next_byte"]
  }

Optional Tool: set_history_limit
- description: Set tmux history-limit for panes in the managed session
- request schema:
  {
    type: "object",
    properties: { limit: { type: "number" } },
    required: ["limit"]
  }
- response schema:
  {
    type: "object",
    properties: { success: { type: "boolean" } },
    required: ["success"]
  }

---

## 4) Payload Convention (MCP)

- Content: return results as:
  {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
  }
- This matches the current “normal MCP payload” preference.

---

## 5) File and Module Plan

- src/services/tmuxManager.ts
  - Replace exec with spawn(argv) for all tmux commands.
  - Fix targeting: always `-t "@ID"`.
  - Atomic window creation: `new-window -P -F "#{window_id}"`.
  - Add: enablePipePane(windowId), getLogPath(windowId), tailLines(windowId, n), readFromByte(windowId, from, max).
  - Add: executeBounded(windowId, cmd, timeout, stripAnsi) using START/END markers and capture-pane -J.
  - Add: startProcess(windowId, cmd, appendNewline), stopProcess(windowId, signal).
  - Add: per-pane mutex to serialize send-keys/exec sequences.
  - Add: default-shell setup and optional login shell; history-limit config.

- src/tools/definitions.ts
  - Replace old schemas with first-principles tool schemas above.

- src/tools/handlers.ts
  - Implement new handlers and validation; call into tmuxManager methods; format MCP results.

- src/server.ts
  - Register updated capabilities; route tools; maintain error handling.

- test/
  - Add new spec files and e2e cases (see TDD plan below).
  - Replace tests tied to deprecated tools with new ones.

- README.md
  - Update examples and API reference to match new tools.

---

## 6) TDD Test Plan (Test-First)

For each feature/phase, write tests first. Use vitest. Employ the raw MCP client harness and a high-level test client wrapper.

### 6.1 Global Test Utilities
- Test harness spins up the MCP server against a temp socket directory.
- Helpers to:
  - Create tabs and write probe commands.
  - Start processes (e.g., a simple `node -e '...'` or `python -u -c '...'`) that emit periodic logs.
  - Simulate ANSI sequences to validate strip_ansi behavior.

---

## 7) Phased Approach with Checklists and Test Criteria

### Phase 1 — tmux correctness and infra
[ ] Switch to spawn(argv) for tmux  
[ ] Fix targeting to use -t "@ID" everywhere  
[ ] Atomic create_tab using `-P -F "#{window_id}"`  
[ ] Tab-delimited parsing for list_windows  
[ ] Default-shell set to $SHELL; optional login shell toggle  
[ ] Set history-limit to a bounded high value  
[ ] Per-pane mutex for serialized interactions  

Tests:
- [ ] Create tab returns "@N" and name supports spaces
- [ ] list_tabs handles names with spaces; returns accurate active flag
- [ ] Multiple rapid create_tab calls produce distinct IDs (no race)
- [ ] Default-shell in effect (verify `$SHELL` value inside pane)
- [ ] History limit applied (verify tmux show-options)

### Phase 2 — Pipe-pane logging and read_logs_from_tab
[ ] enablePipePane for each new pane with managed log path  
[ ] Implement read_logs_from_tab(window_id, lines, strip_ansi)  
[ ] Large-file safety and truncation indicator  

Tests:
- [ ] Start a noisy process; read last 200/1000/5000 lines stable
- [ ] strip_ansi toggles behavior correctly
- [ ] Logs persist across server restart (durability)
- [ ] Truncated flag true when total lines exceed requested

### Phase 3 — Synchronous execute_command with markers
[ ] Implement executeBounded with START/END markers and capture-pane -J  
[ ] Timeout handling with C-c on timeout and timed_out flag  
[ ] No pane clearing by default  

Tests:
- [ ] Simple echo returns exact payload between markers; no prompt leakage
- [ ] Non-zero exit codes surfaced
- [ ] Timeout triggers C-c and returns timed_out: true
- [ ] Concurrency on same pane is serialized (no interleaving)

### Phase 4 — start_process / stop_process
[ ] start_process sends command; optional newline; returns immediately  
[ ] stop_process sends SIGINT (C-c) or SIGTERM as requested  
[ ] Ensure pipe-pane resumes correctly after stop/start cycles  

Tests:
- [ ] Long-running process produces logs; read_logs_from_tab sees new lines
- [ ] stop_process gracefully stops; subsequent start works
- [ ] Rapid start/stop does not corrupt logs

### Phase 5 — Optional stream_logs_from_tab by offset
[ ] stream_logs_from_tab(window_id, from_byte, max_bytes)  
[ ] next_byte and eof semantics defined  

Tests:
- [ ] Streaming resumes from prior offsets (no gaps)
- [ ] Backwards seeking supported by setting smaller from_byte
- [ ] Large output chunks handled without memory blowup

### Phase 6 — Documentation and Examples
[ ] README updated with new tools and examples  
[ ] API examples for typical workflows  
[ ] Guidance on enabling login shell and history settings  

Tests (docs sanity):
- [ ] Example snippets pass basic execution in test harness

---

## 8) Detailed Testing Criteria by Tool

create_tab
- [ ] Creates tab with optional name/cwd/env/login without error
- [ ] Returns valid "@N"
- [ ] Subsequent list_tabs includes the created tab

list_tabs
- [ ] Returns array with window_id/name/active
- [ ] Works with multiple tabs and names with spaces

read_logs_from_tab
- [ ] Returns exactly N last lines, with truncated flag if applicable
- [ ] strip_ansi true removes ANSI sequences; false preserves them

execute_command
- [ ] Output captured strictly between markers; includes stderr if printed to pane
- [ ] exit_code correct; timed_out true when timeout occurs
- [ ] Multiple sequential invocations on same pane remain ordered

start_process
- [ ] Returns immediately; logs begin to flow to the file
- [ ] append_newline controls whether Enter is sent

stop_process
- [ ] Sends C-c by default; process stops; logs record shutdown
- [ ] SIGTERM option handled if implemented

stream_logs_from_tab (optional)
- [ ] from_byte/next_byte works across restarts
- [ ] max_bytes limits payload size

---

## 9) Implementation Notes (Low-level)

- Marker sandwich for execute_command:
  - START: printf '⟦MCP-START:%UUID%⟧\n'
  - END: printf '⟦MCP-END:%UUID% EC=%d⟧\n' "$exit"
  - Slice lines strictly between these markers; use capture-pane -J.
- ANSI stripping:
  - Use a robust regex or a small library; guard with strip_ansi flag.
- Log files:
  - Directory per tmux socket; per-pane filename pane-@N.log; rotate by size/time (later).
- Time math:
  - Not required; we are line-count oriented by design decision.

---

## 10) Resolved Decisions from Stakeholder Input

- Pipe-pane selected for logs (simple, durable).
- Line-count oriented log reading; time-based is not needed.
- Streaming supported but primarily for human operators; agents rely on read_logs_from_tab.
- Core tool set: create_tab, list_tabs, read_logs_from_tab, execute_command, start_process, stop_process.
- No security sandboxing required.
- Use normal MCP payload (text + JSON string).
- No backward compatibility constraints: adopt first-principles API now.

---

## 11) Full MCP Server Capabilities Example (tools/list response)

This is an example of the server’s tools/list result payload (embedded as text JSON per “normal MCP payload”):

{
  "tools": {
    "create_tab": {
      "name": "create_tab",
      "description": "Create a new terminal tab (tmux window)",
      "schema": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "description": "Optional name for the tab" },
          "cwd": { "type": "string", "description": "Optional working directory for the shell" },
          "env": { "type": "object", "additionalProperties": { "type": "string" }, "description": "Optional environment variables" },
          "login": { "type": "boolean", "description": "Start shell as a login shell (e.g., zsh -l)" }
        },
        "required": []
      },
      "returns": {
        "type": "object",
        "properties": {
          "window_id": { "type": "string", "description": "tmux window id, e.g., '@3'" },
          "name": { "type": "string" }
        },
        "required": ["window_id"]
      }
    },
    "list_tabs": {
      "name": "list_tabs",
      "description": "List all terminal tabs",
      "schema": { "type": "object", "properties": {}, "required": [] },
      "returns": {
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
    },
    "read_logs_from_tab": {
      "name": "read_logs_from_tab",
      "description": "Read recent logs from a tab’s pipe-pane file; line-count oriented",
      "schema": {
        "type": "object",
        "properties": {
          "window_id": { "type": "string" },
          "lines": { "type": "number", "description": "Number of lines to return from the end (default 500)" },
          "strip_ansi": { "type": "boolean", "description": "Remove ANSI sequences in returned content (default false)" }
        },
        "required": ["window_id"]
      },
      "returns": {
        "type": "object",
        "properties": {
          "content": { "type": "string" },
          "returned_lines": { "type": "number" },
          "truncated": { "type": "boolean", "description": "True if more lines existed than returned" }
        },
        "required": ["content"]
      }
    },
    "execute_command": {
      "name": "execute_command",
      "description": "Execute a command in a tab and return only the output produced between START/END markers",
      "schema": {
        "type": "object",
        "properties": {
          "window_id": { "type": "string" },
          "command": { "type": "string" },
          "timeout_ms": { "type": "number", "description": "Max wait for END marker; non-zero required for bounded exec (default 10000)" },
          "strip_ansi": { "type": "boolean", "description": "Strip ANSI sequences (default false)" }
        },
        "required": ["window_id", "command"]
      },
      "returns": {
        "type": "object",
        "properties": {
          "output": { "type": "string" },
          "exit_code": { "type": "number" },
          "timed_out": { "type": "boolean" }
        },
        "required": ["output"]
      }
    },
    "start_process": {
      "name": "start_process",
      "description": "Start a long-running process; returns immediately; logs stream to pipe-pane file",
      "schema": {
        "type": "object",
        "properties": {
          "window_id": { "type": "string" },
          "command": { "type": "string" },
          "append_newline": { "type": "boolean", "description": "Append newline (Enter) after typing command (default true)" }
        },
        "required": ["window_id", "command"]
      },
      "returns": {
        "type": "object",
        "properties": { "started": { "type": "boolean" } },
        "required": ["started"]
      }
    },
    "stop_process": {
      "name": "stop_process",
      "description": "Gracefully stop foreground process in given tab",
      "schema": {
        "type": "object",
        "properties": {
          "window_id": { "type": "string" },
          "signal": { "type": "string", "description": "One of SIGINT|SIGTERM; default SIGINT via C-c" }
        },
        "required": ["window_id"]
      },
      "returns": {
        "type": "object",
        "properties": { "success": { "type": "boolean" } },
        "required": ["success"]
      }
    },
    "stream_logs_from_tab": {
      "name": "stream_logs_from_tab",
      "description": "(Optional) Read logs by byte offsets for durable consumption",
      "schema": {
        "type": "object",
        "properties": {
          "window_id": { "type": "string" },
          "from_byte": { "type": "number", "description": "Start offset (default 0)" },
          "max_bytes": { "type": "number", "description": "Max bytes to read (default 65536)" },
          "strip_ansi": { "type": "boolean", "description": "Strip ANSI sequences (default false)" }
        },
        "required": ["window_id"]
      },
      "returns": {
        "type": "object",
        "properties": {
          "chunk": { "type": "string" },
          "next_byte": { "type": "number" },
          "eof": { "type": "boolean" }
        },
        "required": ["chunk", "next_byte"]
      }
    }
  }
}

---

## 12) Detailed File Changes and New Files

Core changes:
- src/services/tmuxManager.ts
  - New/changed methods:
    - initialize(sessionName: string, socketPath: string, options: { defaultShell?: string; login?: boolean; historyLimit?: number })
    - createTab(opts: { name?: string; cwd?: string; env?: Record<string,string>; login?: boolean }): Promise<{ windowId: string; name: string }>
    - listTabs(): Promise<Array<{ id: string; name: string; active: boolean }>>
    - enablePipePane(windowId: string): Promise<string> // returns log path
    - getLogPath(windowId: string): string
    - tailLines(windowId: string, lines: number, stripAnsi?: boolean): Promise<{ content: string; returned: number; truncated: boolean }>
    - readFromByte(windowId: string, from: number, maxBytes: number, stripAnsi?: boolean): Promise<{ chunk: string; next: number; eof: boolean }>
    - executeBounded(windowId: string, command: string, timeoutMs: number, stripAnsi?: boolean): Promise<{ output: string; exitCode: number; timedOut: boolean }>
    - startProcess(windowId: string, command: string, appendNewline: boolean): Promise<{ started: boolean }>
    - stopProcess(windowId: string, signal?: "SIGINT" | "SIGTERM"): Promise<{ success: boolean }>
  - Internal:
    - spawnTmux(args: string[]): Promise<{ stdout: string; stderr: string; code: number }>
    - per-pane mutex map for serialized operations
    - tab-delimited parsing; always target -t "@ID"
    - construct START/END markers and capture -J

- src/tools/definitions.ts
  - Replace tool definitions with schemas in section 3.2.

- src/tools/handlers.ts
  - Implement handlers for:
    - CreateTabHandler
    - ListTabsHandler
    - ReadLogsFromTabHandler
    - ExecuteCommandHandler
    - StartProcessHandler
    - StopProcessHandler
    - (Optional) StreamLogsFromTabHandler

- src/server.ts
  - Register only the new tools (first-principles API).
  - Update capabilities and list/call routing.

New files (optional but recommended):
- src/utils/ansi.ts // stripAnsi(text: string): string
- src/utils/mutex.ts // simple per-key async mutex/queue
- src/services/logPaths.ts // centralizes log directory per socket/session

Tests to add:
- test/e2e/tabs.test.ts
- test/e2e/logging-read-logs.test.ts
- test/e2e/execute-bounded.test.ts
- test/e2e/processes-start-stop.test.ts
- test/e2e/streaming-offsets.test.ts (optional)
- test/unit/ansi-strip.test.ts
- test/unit/mutex-serialize.test.ts

---

## 13) TDD: Test File Skeletons and Criteria

test/e2e/tabs.test.ts
- creates tabs with names (including spaces), lists tabs, validates active flags.

test/e2e/logging-read-logs.test.ts
- starts a noisy process, reads last N lines with/without strip_ansi, checks truncated flag, verifies durability across restart.

test/e2e/execute-bounded.test.ts
- runs quick commands, validates START/END slicing, exit codes, timeout behavior (C-c), and serialization on same pane.

test/e2e/processes-start-stop.test.ts
- validates immediate return of start_process, growth of log file, graceful stop via C-c, restart sequences.

test/e2e/streaming-offsets.test.ts (optional)
- validates from_byte/next_byte across restarts, backward seeking, large chunk handling.

test/unit/ansi-strip.test.ts
- verifies stripping rules across common ANSI sequences.

test/unit/mutex-serialize.test.ts
- verifies per-pane queuing prevents interleaving.

---

## 14) Deep Explanations (Reference)

- Control Mode vs pipe-pane (pros/cons, durability) and guarantees discussion were finalized earlier.
- Agents consume read_logs_from_tab (line-count), streaming is primarily human-focused but supported.

---

## 15) Next Steps

- Proceed with TDD: author Phase 1 tests first, then implement code to satisfy them.
- When ready to implement, toggle to Act mode. We will:
  - Update tmuxManager, tool definitions/handlers, and server wiring.
  - Implement per-phase features strictly following the checklists above.
  - Land tests and ensure CI passes after each phase.
