/**
 * Tool handlers for the Terminally-mcp server
 * Implements the business logic for each MCP tool
 */
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { TmuxManager, TmuxWindow } from '../services/tmuxManager.js';

/**
 * Base handler class with common functionality
 */
abstract class ToolHandler<TArgs = any, TReturn = any> {
  protected tmuxManager: TmuxManager;

  constructor(tmuxManager: TmuxManager) {
    this.tmuxManager = tmuxManager;
  }

  abstract handle(args: TArgs): Promise<TReturn>;

  protected validateArgs(args: any, required: string[]) {
    for (const key of required) {
      if (args[key] === undefined || args[key] === null) {
        throw new McpError(ErrorCode.InvalidParams, `Missing required parameter: ${key}`);
      }
    }
  }
}

/**
 * Handler for creating a new terminal tab
 */
export class CreateTabToolHandler extends ToolHandler<
  { name?: string; cwd?: string; env?: Record<string, string>; login?: boolean }, 
  { window_id: string; name: string }
> {
  async handle(args: { name?: string; cwd?: string; env?: Record<string, string>; login?: boolean }): Promise<{ window_id: string; name: string }> {
    try {
      const result = await this.tmuxManager.createTab(args);
      return result;
    } catch (error) {
      console.error('Error in CreateTabToolHandler:', error);
      throw error;
    }
  }
}

/**
 * Handler for listing all terminal tabs
 */
export class ListTabsToolHandler extends ToolHandler<{}, { tabs: Array<{ window_id: string, name: string, active: boolean }> }> {
  async handle(): Promise<{ tabs: Array<{ window_id: string, name: string, active: boolean }> }> {
    try {
      const windows = await this.tmuxManager.listTabs();
      
      // Convert TmuxWindow[] to the expected output format
      const tabs = windows.map((window: TmuxWindow) => ({
        window_id: window.id,
        name: window.name,
        active: window.active
      }));
      
      return { tabs };
    } catch (error) {
      console.error('Error in ListTabsToolHandler:', error);
      throw new McpError(ErrorCode.InternalError, (error as Error).message);
    }
  }
}

/**
 * Handler for reading logs from a terminal tab
 */
export class ReadLogsFromTabToolHandler extends ToolHandler<
  { window_id: string; lines?: number; strip_ansi?: boolean }, 
  { content: string; returned_lines: number; truncated: boolean }
> {
  async handle(args: { window_id: string; lines?: number; strip_ansi?: boolean }): Promise<{ content: string; returned_lines: number; truncated: boolean }> {
    this.validateArgs(args, ['window_id']);
    try {
      const result = await this.tmuxManager.readLogsFromTab(
        args.window_id,
        args.lines || 500,
        args.strip_ansi || false
      );
      
      return result;
    } catch (error) {
      console.error('Error in ReadLogsFromTabToolHandler:', error);
      throw new McpError(ErrorCode.InternalError, `Error reading logs: ${(error as Error).message}`);
    }
  }
}

/**
 * Handler for executing a command in a terminal tab
 */
export class ExecuteCommandToolHandler extends ToolHandler<
  { window_id: string; command: string; timeout_ms?: number; strip_ansi?: boolean }, 
  { output: string; exit_code: number; timed_out: boolean }
> {
  async handle(args: { window_id: string; command: string; timeout_ms?: number; strip_ansi?: boolean }): Promise<{ output: string; exit_code: number; timed_out: boolean }> {
    this.validateArgs(args, ['window_id', 'command']);
    try {
      const result = await this.tmuxManager.executeCommand(
        args.window_id,
        args.command,
        args.timeout_ms || 10000,
        args.strip_ansi || false
      );
      
      return result;
    } catch (error) {
      console.error('Error in ExecuteCommandToolHandler:', error);
      throw new McpError(ErrorCode.InternalError, `Error executing command: ${(error as Error).message}`);
    }
  }
}

/**
 * Handler for starting a long-running process
 */
export class StartProcessToolHandler extends ToolHandler<
  { window_id: string; command: string; append_newline?: boolean }, 
  { started: boolean }
> {
  async handle(args: { window_id: string; command: string; append_newline?: boolean }): Promise<{ started: boolean }> {
    this.validateArgs(args, ['window_id', 'command']);
    try {
      const result = await this.tmuxManager.startProcess(
        args.window_id,
        args.command,
        args.append_newline !== false
      );
      
      return result;
    } catch (error) {
      console.error('Error in StartProcessToolHandler:', error);
      throw new McpError(ErrorCode.InternalError, `Error starting process: ${(error as Error).message}`);
    }
  }
}

/**
 * Handler for stopping a process
 */
export class StopProcessToolHandler extends ToolHandler<
  { window_id: string; signal?: string }, 
  { success: boolean }
> {
  async handle(args: { window_id: string; signal?: string }): Promise<{ success: boolean }> {
    this.validateArgs(args, ['window_id']);
    try {
      const result = await this.tmuxManager.stopProcess(
        args.window_id,
        args.signal || 'SIGINT'
      );
      
      return result;
    } catch (error) {
      console.error('Error in StopProcessToolHandler:', error);
      throw new McpError(ErrorCode.InternalError, `Error stopping process: ${(error as Error).message}`);
    }
  }
}
