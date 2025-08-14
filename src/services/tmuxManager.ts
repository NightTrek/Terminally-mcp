/**
 * TmuxManager - Responsible for managing the tmux server and interactions with it
 */
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { setTimeout as sleep } from 'timers/promises';
import { KeyMutex } from '../utils/mutex.js';

// Interface for window information
export interface TmuxWindow {
  id: string; // Window ID (e.g., @0, @1, etc.)
  name: string; // Window name (user defined or auto-generated)
  active: boolean; // Whether this window is currently active
}

export class TmuxManager {
  private socketPath: string;
  private sessionName: string;
  private tmuxProcess: ReturnType<typeof spawn> | null = null; // reserved for future long-lived server mgmt
  private initialized: boolean = false;

  // Per-pane serialization to prevent interleaving send-keys/capture operations
  private paneMutex = new KeyMutex();

  constructor() {
    // Create unique socket path to avoid conflicts with user's tmux
    const tempDir = os.tmpdir();
    this.socketPath = path.join(tempDir, `tmux-mcp-${uuidv4()}.sock`);

    // Session name used for the managed tmux session
    this.sessionName = 'mcp-terminally';
  }

  /**
   * Run a process and capture its stdout/stderr. Reject on non-zero exit.
   */
  private spawnAndCapture(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        const c = code ?? 0;
        if (c === 0) {
          resolve({ stdout, stderr, code: c });
        } else {
          reject(new Error(`${cmd} exited with code ${c}: ${stderr || stdout}`));
        }
      });
    });
  }

  /**
   * Convenience wrapper to call tmux with our socket path using argv.
   */
  private tmux(args: string[]) {
    return this.spawnAndCapture('tmux', ['-S', this.socketPath, ...args]);
  }

  /**
   * Check if tmux is installed on the system
   */
  async checkTmuxInstalled(): Promise<boolean> {
    try {
      await this.spawnAndCapture('tmux', ['-V']);
      return true;
    } catch (error) {
      throw new Error('tmux is not installed. Please install tmux to use this MCP server.');
    }
  }

  /**
   * Start tmux server and create the main session.
   * Also configure default shell, login shell behavior, and history limit.
   */
  async startServer(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Create a new session; this will start the server on the custom socket if needed.
      try {
        await this.tmux(['new-session', '-d', '-s', this.sessionName, '-n', 'default']);
      } catch (e: any) {
        const msg = String(e?.message || e);
        // Ignore duplicate session errors (server already running with our session)
        if (!/duplicate session|session already exists/i.test(msg)) {
          throw e;
        }
      }

      // Configure defaults for subsequent windows/panes
      const bash = '/bin/bash';
      await this.tmux(['set-option', '-g', 'default-shell', bash]);
      await this.tmux(['set-option', '-g', 'default-command', `${bash} -l`]);
      await this.tmux(['set-option', '-g', 'history-limit', '50000']);
      // Help shells treat large pastes atomically (reduce line-edit artifacts)
      await this.tmux(['set-option', '-g', 'assume-paste-time', '1']);

      this.initialized = true;
      // eslint-disable-next-line no-console
      console.log(`tmux server started with socket: ${this.socketPath}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to start tmux server:', error);
      throw error;
    }
  }

  /**
   * Stop tmux server
   */
  async stopServer(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      await this.tmux(['kill-server']);
      this.initialized = false;
      // eslint-disable-next-line no-console
      console.log('tmux server stopped');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to stop tmux server:', error);
      // Don't throw here, as we're typically calling this during shutdown
    }
  }

  /**
   * Create a new tab (window in tmux terminology)
   */
  async createTab(name?: string): Promise<string> {
    if (!this.initialized) {
      await this.startServer();
    }

    const windowName = name || `tab-${Date.now()}`;
    const safeName = windowName.replace(/#/g, '##'); // escape '#' to prevent tmux format expansion

    try {
      // Create a new window in the session and print its window_id atomically
      const { stdout } = await this.tmux([
        'new-window',
        '-d',
        '-t',
        this.sessionName,
        '-n',
        safeName,
        '-P',
        '-F',
        '#{window_id}',
      ]);
      const windowId = stdout.trim().split('\n').slice(-1)[0].trim();
      return windowId;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to create tab:', error);
      throw error;
    }
  }

  /**
   * Close a specific tab (window)
   */
  async closeTab(windowId: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('tmux server not initialized');
    }

    try {
      await this.tmux(['kill-window', '-t', windowId]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to close tab ${windowId}:`, error);
      throw error;
    }
  }

  /**
   * List all tabs (windows)
   */
  async listTabs(): Promise<TmuxWindow[]> {
    if (!this.initialized) {
      await this.startServer();
    }

    try {
      const { stdout } = await this.tmux([
        'list-windows',
        '-t',
        this.sessionName,
        '-F',
        '#{window_id}\t#{window_name}\t#{window_active}',
      ]);

      const windows: TmuxWindow[] = [];
      const raw = stdout.trim();
      if (!raw) return windows;

      const lines = raw.split('\n');

      for (const line of lines) {
        const parts = line.split('\t');
        const id = parts[0];
        const name = parts.slice(1, parts.length - 1).join('\t'); // preserve any tabs inside name
        const activeStr = parts[parts.length - 1];
        windows.push({
          id,
          name,
          active: activeStr === '1',
        });
      }

      return windows;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to list tabs:', error);
      throw error;
    }
  }

  /**
   * Execute a command in a specific tab (window) and capture its output using markers.
   * Phase 1.1: Use argv-based tmux calls and per-pane mutex. Run in-pane shell directly
   * by typing a printf-delimited compound script (no base64 | sh) to avoid shell differences.
   * On timeout, gracefully interrupt (C-c) and return whatever output is available.
   * Preserve user's last exit code ($?) across calls by ending with a subshell exit $__EC.
   */
  async executeCommand(windowId: string, command: string, timeout: number = 10000): Promise<string> {
    if (!this.initialized) {
      throw new Error('tmux server not initialized');
    }

    const startMarker = `MCP_START_MARKER_${uuidv4()}`;
    const endMarker = `MCP_END_MARKER_${uuidv4()}`;
    const exitCodeMarker = `_EXIT_CODE:`;

    return this.paneMutex.runExclusive(windowId, async () => {
      try {
        // Use a unique heredoc to pass a script to bash -lc safely without quoting issues, preserving exit code into the parent shell's $?
        const heredoc = `__MCP_${uuidv4().replace(/-/g, '')}`;
        const script =
          `printf '%s\\n' '${startMarker}'; ` +
          `{ ${command} ; __EC=$?; printf '%s\\n' '${endMarker}${exitCodeMarker}'"$__EC"; exit $__EC; }`;
        const toType = `cat <<'${heredoc}' | bash -lc
${script}
${heredoc}`;

        // Always use paste-buffer to inject the script atomically (avoids interactive quoting issues)
        await this.tmux(['set-buffer', '--', toType]);
        await this.tmux(['paste-buffer', '-t', windowId]);
        await this.tmux(['send-keys', '-t', windowId, 'Enter']);

        // Poll pane until END marker or timeout
        let paneDump = '';
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
          const { stdout } = await this.tmux(['capture-pane', '-J', '-p', '-S', '-', '-E', '-', '-t', windowId]);
          if (stdout.includes(endMarker)) {
            paneDump = stdout;
            break;
          }
          await sleep(50);
        }

        // On timeout: interrupt the foreground process and capture what we have.
        if (!paneDump) {
          await this.tmux(['send-keys', '-t', windowId, 'C-c']);
          await sleep(50);
          const { stdout } = await this.tmux(['capture-pane', '-J', '-p', '-S', '-', '-E', '-', '-t', windowId]);
          paneDump = stdout;
          // Do not throw; tests expect a graceful return even if timing out.
        }

        // Normalize and parse
        const normalized = paneDump.replace(/\r/g, '').replace(/\u000c/g, '');
        const lines = normalized.split('\n');

        const startIdx = lines.findIndex((l) => l.trim() === startMarker);

        let endIdx = -1;
        for (let i = startIdx + 1; i < lines.length; i++) {
          if (lines[i].includes(endMarker)) {
            endIdx = i;
            break;
          }
        }

        if (startIdx === -1) {
          // Never saw start marker; nothing reliable to return
          return '';
        }

        const payloadLines = endIdx !== -1 ? lines.slice(startIdx + 1, endIdx) : lines.slice(startIdx + 1);
        const payload = payloadLines.join('\n').trim();

        return payload;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to execute command in tab ${windowId}:`, error);
        if (error instanceof Error) {
          throw new Error(`Error executing command '${command}': ${error.message}`);
        } else {
          throw new Error(`An unknown error occurred while executing command '${command}'.`);
        }
      }
    });
  }

  /**
   * Read output from a specific tab (window), attempting to clean it.
   * Phase 1: Use argv-based tmux and serialize with mutex.
   */
  async readOutput(windowId: string, historyLimit?: number): Promise<string> {
    if (!this.initialized) {
      throw new Error('tmux server not initialized');
    }

    return this.paneMutex.runExclusive(windowId, async () => {
      try {
        const args: string[] = ['capture-pane', '-p'];
        if (historyLimit && historyLimit > 0) {
          // -S -N gets the last N lines from history.
          args.push('-S', `-${historyLimit}`);
        } else {
          // Capture entire visible pane + history by default if no limit
          args.push('-S', '-', '-E', '-');
        }
        args.push('-t', windowId);

        // Execute and get the pane content
        const { stdout } = await this.tmux(args);

        // Clean the output: remove prompt lines, MCP markers, and empty lines
        const lines = stdout.split('\n');
        const cleanedLines = lines
          .map((line) => line.trimEnd()) // Trim trailing whitespace
          .filter((line) => {
            if (!line) return false; // Remove empty lines

            // Remove common shell prompt artifacts
            if (line.includes('➜') || line.startsWith('$') || line.startsWith('#')) return false;

            // Remove our bounded-exec marker lines
            if (line.includes('MCP_START_MARKER') || line.includes('MCP_END_MARKER')) return false;

            // Remove heredoc injection scaffolding from executeCommand
            // e.g., "cat <<'__MCP_...'" line, the heredoc terminator "__MCP_...", and any lines containing the token
            if (/^cat <<'.*__MCP_[A-Za-z0-9]+' \| bash -lc/.test(line)) return false;
            if (/^__MCP_[A-Za-z0-9]+$/.test(line.trim())) return false;
            if (line.includes('__MCP_')) return false;

            // Remove printf lines that print our markers and script control lines
            if (line.includes("printf '%s\\n' 'MCP_START_MARKER") || line.includes("printf '%s\\n' 'MCP_END_MARKER")) return false;

            // Remove execution control artifacts from the injected script
            if (line.includes('__EC=$?') || line.includes('exit $__EC')) return false;

            return true;
          });

        return cleanedLines.join('\n').trim(); // Trim final result
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to read output from tab ${windowId}:`, error);
        throw new Error(`Failed to read output: ${(error as Error).message}`);
      }
    });
  }

  /**
   * Get the base tmux command with socket (for debugging/logging only)
   * Useful for constructing complex commands
   */
  getTmuxBaseCommand(): string {
    return `tmux -S "${this.socketPath}"`;
  }

  /**
   * Get the session name
   */
  getSessionName(): string {
    return this.sessionName;
  }

  /**
   * Check if the tmux server is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
