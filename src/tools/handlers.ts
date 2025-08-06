/**
 * Tool handlers for the Terminally-mcp server
 * Implements the business logic for each MCP tool
 */
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
}

/**
 * Handler for creating a new terminal tab
 */
export class CreateTabToolHandler extends ToolHandler<{ name?: string }, { window_id: string }> {
  async handle(args: { name?: string }): Promise<{ window_id: string }> {
    try {
      const windowId = await this.tmuxManager.createTab(args.name);
      return { window_id: windowId };
    } catch (error) {
      console.error('Error in CreateTabToolHandler:', error);
      throw error;
    }
  }
}

/**
 * Handler for closing a terminal tab
 */
export class CloseTabToolHandler extends ToolHandler<{ window_id: string }, { success: boolean }> {
  async handle(args: { window_id: string }): Promise<{ success: boolean }> {
    try {
      await this.tmuxManager.closeTab(args.window_id);
      return { success: true };
    } catch (error) {
      console.error('Error in CloseTabToolHandler:', error);
      return { success: false };
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
      return { tabs: [] };
    }
  }
}

/**
 * Handler for executing a command in a terminal tab
 */
export class ExecuteCommandToolHandler extends ToolHandler<
  { window_id: string, command: string, timeout?: number }, 
  { output: string }
> {
  async handle(args: { window_id: string, command: string, timeout?: number }): Promise<{ output: string }> {
    try {
      const output = await this.tmuxManager.executeCommand(
        args.window_id,
        args.command,
        args.timeout
      );
      
      return { output };
    } catch (error) {
      console.error('Error in ExecuteCommandToolHandler:', error);
      return { output: `Error executing command: ${(error as Error).message}` };
    }
  }
}

/**
 * Handler for reading output from a terminal tab
 */
export class ReadOutputToolHandler extends ToolHandler<
  { window_id: string, history_limit?: number }, 
  { content: string }
> {
  async handle(args: { window_id: string, history_limit?: number }): Promise<{ content: string }> {
    try {
      const content = await this.tmuxManager.readOutput(
        args.window_id,
        args.history_limit
      );
      
      return { content };
    } catch (error) {
      console.error('Error in ReadOutputToolHandler:', error);
      return { content: `Error reading output: ${(error as Error).message}` };
    }
  }
}
