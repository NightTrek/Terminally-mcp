/**
 * Terminally MCP server configuration and setup
 * Provides tools for controlling terminal sessions via tmux
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { TmuxManager } from './services/tmuxManager.js';
import { createTabToolDefinition, closeTabToolDefinition, listTabsToolDefinition, executeCommandToolDefinition, readOutputToolDefinition } from './tools/definitions.js';
import { CreateTabToolHandler, CloseTabToolHandler, ListTabsToolHandler, ExecuteCommandToolHandler, ReadOutputToolHandler } from './tools/handlers.js';

export class TerminallyServer {
  private server: Server;
  private tmuxManager: TmuxManager;
  
  // Tool handlers
  private createTabToolHandler: CreateTabToolHandler;
  private closeTabToolHandler: CloseTabToolHandler;
  private listTabsToolHandler: ListTabsToolHandler;
  private executeCommandToolHandler: ExecuteCommandToolHandler;
  private readOutputToolHandler: ReadOutputToolHandler;

  constructor() {
    // Initialize server
    this.server = new Server(
      {
        name: 'Terminally-mcp',
        version: '1.0.0'
      },
      {
        capabilities: {
          protocolVersion: '0.3',
          tools: {
            create_tab: createTabToolDefinition,
            close_tab: closeTabToolDefinition,
            list_tabs: listTabsToolDefinition,
            execute_command: executeCommandToolDefinition,
            read_output: readOutputToolDefinition
          }
        }
      }
    );

    // Log the MCP server information
    console.log('Initializing MCP server:', {
      name: 'Terminally-mcp',
      version: '1.0.0'
    });

    // Initialize the tmux manager
    this.tmuxManager = new TmuxManager();

    // Initialize tool handlers
    this.createTabToolHandler = new CreateTabToolHandler(this.tmuxManager);
    this.closeTabToolHandler = new CloseTabToolHandler(this.tmuxManager);
    this.listTabsToolHandler = new ListTabsToolHandler(this.tmuxManager);
    this.executeCommandToolHandler = new ExecuteCommandToolHandler(this.tmuxManager);
    this.readOutputToolHandler = new ReadOutputToolHandler(this.tmuxManager);

    // Register tool handlers
    this.setupToolHandlers();

    // Set up error handling
    this.setupErrorHandling();
  }

  /**
   * Registers tool handlers with the MCP server
   */
  private setupToolHandlers() {
    // Define server capabilities handler
    
    // Register server capabilities handler using proper Zod schema
    const ServerCapabilitiesSchema = z.object({
      method: z.literal('server/capabilities'),
      params: z.object({}).optional()
    });
    
    this.server.setRequestHandler(ServerCapabilitiesSchema, async () => {
      return {
        protocolVersion: '0.3',
        tools: {
          create_tab: createTabToolDefinition,
          close_tab: closeTabToolDefinition,
          list_tabs: listTabsToolDefinition,
          execute_command: executeCommandToolDefinition,
          read_output: readOutputToolDefinition
        }
      };
    });

    // Register tool definitions - this handles the 'tools/list' method
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        createTabToolDefinition, 
        closeTabToolDefinition, 
        listTabsToolDefinition, 
        executeCommandToolDefinition, 
        readOutputToolDefinition
      ]
    }));

    // Register tool request handler - this handles the 'tools/call' method
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        let result;
        switch (request.params.name) {
          case createTabToolDefinition.name:
            result = await this.createTabToolHandler.handle(request.params.arguments as { name?: string });
            break;
          
          case closeTabToolDefinition.name:
            result = await this.closeTabToolHandler.handle(request.params.arguments as { window_id: string });
            break;
          
          case listTabsToolDefinition.name:
            result = await this.listTabsToolHandler.handle();
            break;
          
          case executeCommandToolDefinition.name:
            result = await this.executeCommandToolHandler.handle(request.params.arguments as { 
              window_id: string; 
              command: string; 
              timeout?: number;
            });
            break;
          
          case readOutputToolDefinition.name:
            result = await this.readOutputToolHandler.handle(request.params.arguments as { 
              window_id: string; 
              history_limit?: number;
            });
            break;
          
          default:
            console.error(`Unknown tool requested: ${request.params.name}`);
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
        
        // Wrap the result in a content array as expected by MCP SDK
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Error handling tool request:', error);
        // Re-throw MCP errors directly
        if (error instanceof McpError) {
          throw error;
        }
        // Convert other errors to MCP errors
        throw new McpError(
          ErrorCode.InternalError,
          `Internal error: ${(error as Error).message}`
        );
      }
    });
  }

  /**
   * Sets up error handling for the server
   */
  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down Terminally-mcp server...');
      await this.tmuxManager.stopServer();
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Shutting down Terminally-mcp server...');
      await this.tmuxManager.stopServer();
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Starts the tmux manager and runs the MCP server
   */
  async run() {
    try {
      // Ensure tmux is installed
      await this.tmuxManager.checkTmuxInstalled();
      
      // Start the tmux server
      await this.tmuxManager.startServer();
      
      // Connect the MCP server to the transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      console.log('Terminally-mcp server running on stdio');
    } catch (error) {
      console.error('Failed to start Terminally-mcp server:', error);
      throw error;
    }
  }
}
