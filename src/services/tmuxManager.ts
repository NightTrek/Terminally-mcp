/**
 * TmuxManager - Responsible for managing the tmux server and interactions with it
 */
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { setTimeout as sleep } from 'timers/promises';

// Promisify exec function
const execAsync = promisify(exec);

// Interface for window information
export interface TmuxWindow {
  id: string;      // Window ID (e.g., @0, @1, etc.)
  name: string;    // Window name (user defined or auto-generated)
  active: boolean; // Whether this window is currently active
}

export class TmuxManager {
  private socketPath: string;
  private sessionName: string;
  private tmuxProcess: ReturnType<typeof spawn> | null = null;
  private initialized: boolean = false;

  constructor() {
    // Create unique socket path to avoid conflicts with user's tmux
    const tempDir = os.tmpdir();
    this.socketPath = path.join(tempDir, `tmux-mcp-${uuidv4()}.sock`);
    
    // Session name used for the managed tmux session
    this.sessionName = 'mcp-terminally';
  }

  /**
   * Check if tmux is installed on the system
   */
  async checkTmuxInstalled(): Promise<boolean> {
    try {
      await execAsync('which tmux');
      return true;
    } catch (error) {
      throw new Error('tmux is not installed. Please install tmux to use this MCP server.');
    }
  }

  /**
   * Start tmux server and create the main session
   */
  async startServer(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    try {
      // Start a tmux server using the custom socket
      await execAsync(`tmux -S "${this.socketPath}" start-server`);
      
      // Create a new session with a single window
      await execAsync(`tmux -S "${this.socketPath}" new-session -d -s "${this.sessionName}" -n "default"`);
      
      this.initialized = true;
      console.log(`tmux server started with socket: ${this.socketPath}`);
    } catch (error) {
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
      await execAsync(`tmux -S "${this.socketPath}" kill-server`);
      this.initialized = false;
      console.log('tmux server stopped');
    } catch (error) {
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
    
    try {
      // Create a new window in the session
      const { stdout } = await execAsync(
        `tmux -S "${this.socketPath}" new-window -t "${this.sessionName}" -n "${windowName}" && ` +
        `tmux -S "${this.socketPath}" list-windows -t "${this.sessionName}" -F "#{window_id}: #{window_name}"`
      );
      
      // Parse the output to find the ID of the newly created window
      const lines = stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      const windowId = lastLine.split(':')[0].trim();
      
      return windowId;
    } catch (error) {
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
      await execAsync(`tmux -S "${this.socketPath}" kill-window -t "${this.sessionName}:${windowId}"`);
    } catch (error) {
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
      const { stdout } = await execAsync(
        `tmux -S "${this.socketPath}" list-windows -t "${this.sessionName}" ` +
        `-F "#{window_id} #{window_name} #{window_active}"`
      );
      
      const windows: TmuxWindow[] = [];
      const lines = stdout.trim().split('\n');
      
      for (const line of lines) {
        const [id, name, active] = line.split(' ');
        windows.push({
          id,
          name,
          active: active === '1'
        });
      }
      
      return windows;
    } catch (error) {
      console.error('Failed to list tabs:', error);
      throw error;
    }
  }

  /**
   * Execute a command in a specific tab (window) and capture its output using markers.
   */
  async executeCommand(windowId: string, command: string, timeout: number = 10000): Promise<string> {
    if (!this.initialized) {
      throw new Error('tmux server not initialized');
    }

    const startMarker = `MCP_START_MARKER_${uuidv4()}`;
    const endMarker = `MCP_END_MARKER_${uuidv4()}`;

    try {
      // Clear the pane first to avoid confusion with old output
      await execAsync(`tmux -S "${this.socketPath}" send-keys -t "${this.sessionName}:${windowId}" C-l`);
      await sleep(100);

      // Send the start marker
      await execAsync(`tmux -S "${this.socketPath}" send-keys -t "${this.sessionName}:${windowId}" "echo '${startMarker}'" Enter`);
      await sleep(100);

      // Send the actual command using -l flag to send it literally (preserves quotes and special chars)
      // Escape single quotes in the command for the shell
      const escapedCommand = command.replace(/'/g, "'\\''");
      await execAsync(`tmux -S "${this.socketPath}" send-keys -l -t "${this.sessionName}:${windowId}" '${escapedCommand}'`);
      await execAsync(`tmux -S "${this.socketPath}" send-keys -t "${this.sessionName}:${windowId}" Enter`);
      
      // Wait for command to complete
      await sleep(Math.min(timeout / 2, 3000));

      // Send the end marker with exit code
      await execAsync(`tmux -S "${this.socketPath}" send-keys -t "${this.sessionName}:${windowId}" "echo '${endMarker}_EXIT_CODE:'\$?" Enter`);
      await sleep(200);

      // Capture the pane content
      const { stdout } = await execAsync(
        `tmux -S "${this.socketPath}" capture-pane -p -S - -E - -t "${this.sessionName}:${windowId}"`
      );

      const lines = stdout.split('\n');
      let startLineIndex = -1;
      let endLineIndex = -1;
      let exitCode = 0;

      // Find the markers in the output
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(startMarker)) {
          startLineIndex = i;
        }
        if (line.includes(endMarker)) {
          endLineIndex = i;
          // Extract exit code
          const codeMatch = line.match(/_EXIT_CODE:(\d+)/);
          if (codeMatch && codeMatch[1]) {
            exitCode = parseInt(codeMatch[1], 10);
          }
          break;
        }
      }

      // Extract output between markers
      if (startLineIndex !== -1 && endLineIndex !== -1 && endLineIndex > startLineIndex) {
        const outputLines = lines.slice(startLineIndex + 1, endLineIndex);
        const output = outputLines.join('\n').trim();
        
        if (exitCode !== 0) {
          console.warn(`Command exited with code ${exitCode}: ${command}`);
        }
        
        return output || '(no output)';
      } else {
        // Fallback: return cleaned output without markers
        const cleanedOutput = lines
          .filter(line => !line.includes('MCP_START_MARKER') && !line.includes('MCP_END_MARKER'))
          .filter(line => !line.match(/^\s*$/)) // Remove empty lines
          .join('\n')
          .trim();
        
        return cleanedOutput || '(no output captured)';
      }

    } catch (error) {
      console.error(`Failed to execute command in tab ${windowId}:`, error);
      if (error instanceof Error) {
        throw new Error(`Error executing command '${command}': ${error.message}`);
      } else {
        throw new Error(`An unknown error occurred while executing command '${command}'.`);
      }
    }
  }

  /**
   * Read output from a specific tab (window), attempting to clean it
   */
  async readOutput(windowId: string, historyLimit?: number): Promise<string> {
    if (!this.initialized) {
      throw new Error('tmux server not initialized');
    }
    
    try {
      // Build command to capture pane content
      let captureCmd = `tmux -S "${this.socketPath}" capture-pane -p`; // -p preserves whitespace

      // Add history limit if specified. -S -N gets the last N lines from history.
      if (historyLimit && historyLimit > 0) {
        captureCmd += ` -S -${historyLimit}`;
      } else {
         // Capture entire visible pane + history by default if no limit
         captureCmd += ` -S - -E -`; 
      }
      
      captureCmd += ` -t "${this.sessionName}:${windowId}"`;
      
      // Execute and get the pane content
      const { stdout } = await execAsync(captureCmd);

      // Clean the output: remove prompt lines and empty lines
      const lines = stdout.split('\n');
      const cleanedLines = lines
        .map(line => line.trimEnd()) // Trim trailing whitespace
        .filter(line => line && !line.includes('➜') && !line.startsWith('$') && !line.startsWith('#')); // Filter prompts/comments/empty

      return cleanedLines.join('\n').trim(); // Trim final result

    } catch (error) {
      console.error(`Failed to read output from tab ${windowId}:`, error);
      throw new Error(`Failed to read output: ${(error as Error).message}`);
    }
  }

  /**
   * Get the base tmux command with socket
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
