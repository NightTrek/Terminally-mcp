/**
 * MCP Server Test Harness
 * 
 * Utilities for testing the MCP server by starting it in a subprocess
 * and communicating with it via the MCP protocol.
 */
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { join } from 'path';
import { setTimeout as sleep } from 'timers/promises';
import { v4 as uuidv4 } from 'uuid';

export class McpServerTestHarness {
  private serverProcess: ChildProcessWithoutNullStreams | null = null;
  private messageQueue: Array<{ 
    id: string; 
    resolve: (value: any) => void; 
    reject: (reason: any) => void; 
  }> = [];
  private isServerReady = false;

  /**
   * Start the MCP server subprocess
   */
  async start(): Promise<void> {
    // Start the server process
    this.serverProcess = spawn('node', [join(process.cwd(), 'build', 'index.js')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });

    // Handle stderr for logging/debugging
    this.serverProcess.stderr.on('data', (data) => {
      const logMessage = data.toString();
      // For debugging
      console.log(`[Server stderr]: ${logMessage}`);
      
      if (logMessage.includes('tmux server started') || 
          logMessage.includes('Terminally-mcp server running on stdio')) {
        console.log('Server is ready! Detected startup message.');
        this.isServerReady = true;
      }
    });

    // Handle stdout for MCP protocol responses
    this.serverProcess.stdout.on('data', (data) => {
      const dataStr = data.toString();
      
      // Log the raw data for debugging
      console.log(`[Server stdout]: ${dataStr}`);
      
      // Check for server ready messages in stdout as well
      if (dataStr.includes('tmux server started') || 
          dataStr.includes('Terminally-mcp server running on stdio')) {
        console.log('Server is ready! Detected startup message in stdout.');
        this.isServerReady = true;
      }
      
      try {
        // Try to parse line-by-line in case we get multiple responses or partial data
        const lines = dataStr.trim().split('\n');
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const response = JSON.parse(line);
            if (!response.id) continue; // Skip non-jsonrpc responses
            
            const pendingRequest = this.messageQueue.find(req => req.id === response.id);
            
            if (pendingRequest) {
              // Remove from queue
              this.messageQueue = this.messageQueue.filter(req => req.id !== response.id);
              
              if (response.error) {
                pendingRequest.reject(response.error);
              } else {
                pendingRequest.resolve(response.result);
              }
            }
          } catch (lineError) {
            // Skip non-JSON lines, they might be debug output
            // console.error('Error parsing line:', lineError);
          }
        }
      } catch (error) {
        console.error('Error processing server response:', error);
      }
    });

    // Handle process exit
    this.serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Server process exited with code ${code}`);
      }
      this.isServerReady = false;
      this.serverProcess = null;
    });

    // Wait for server to be ready
    let retries = 0;
    // Increased retries for potentially slower startup in test env
    while (!this.isServerReady && retries < 20) { 
      await sleep(500);
      retries++;
    }

    if (!this.isServerReady) {
      console.error('Server readiness flag never became true.');
      throw new Error('Server failed to start or become ready in time');
    }
  }

  /**
   * Stop the MCP server subprocess
   */
  async stop(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
      this.isServerReady = false;
      this.messageQueue = [];
    }
  }

  /**
   * Send an MCP protocol message to the server
   */
  async sendRequest<T = any>(method: string, params: any): Promise<T> {
    if (!this.serverProcess || !this.isServerReady) {
      throw new Error('Server is not running');
    }

    const id = uuidv4();
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    
    const requestJson = JSON.stringify(request);
    console.log(`[Harness sending]: ${requestJson}`); // Log the request

    return new Promise<T>((resolve, reject) => {
      this.messageQueue.push({ id, resolve, reject });
      this.serverProcess?.stdin.write(requestJson + '\n');
    });
  }

  /**
   * Get all available tools
   */
  async listTools(): Promise<any[]> {
    return this.sendRequest('tools/list', {});
  }

  /**
   * Call the create_tab tool
   */
  async createTab(name?: string): Promise<string> {
    try {
      console.log('Calling create_tab tool...');
      
      const response = await this.sendRequest<any>('tools/call', {
        name: 'create_tab',
        arguments: name ? { name } : {}
      });
      
      // Parse the MCP response format
      if (!response || !response.content || !response.content[0]) {
        throw new Error(`Invalid response from create_tab: ${JSON.stringify(response)}`);
      }
      
      const result = JSON.parse(response.content[0].text);
      
      if (!result || !result.window_id) {
        throw new Error(`Invalid result from create_tab: ${JSON.stringify(result)}`);
      }
      
      return result.window_id;
    } catch (error) {
      console.error('Error calling create_tab:', error);
      throw error;
    }
  }

  /**
   * Call the close_tab tool
   */
  async closeTab(windowId: string): Promise<boolean> {
    const response = await this.sendRequest<any>('tools/call', {
      name: 'close_tab',
      arguments: { window_id: windowId }
    });
    
    // Parse the MCP response format
    if (!response || !response.content || !response.content[0]) {
      throw new Error(`Invalid response from close_tab: ${JSON.stringify(response)}`);
    }
    
    const result = JSON.parse(response.content[0].text);
    return result.success;
  }

  /**
   * Call the list_tabs tool
   */
  async listTabs(): Promise<Array<{ window_id: string, name: string, active: boolean }>> {
    const response = await this.sendRequest<any>('tools/call', {
      name: 'list_tabs',
      arguments: {}
    });
    
    // Parse the MCP response format
    if (!response || !response.content || !response.content[0]) {
      throw new Error(`Invalid response from list_tabs: ${JSON.stringify(response)}`);
    }
    
    const result = JSON.parse(response.content[0].text);
    return result.tabs;
  }

  /**
   * Call the execute_command tool
   */
  async executeCommand(windowId: string, command: string, timeout?: number): Promise<string> {
    const response = await this.sendRequest<any>('tools/call', {
      name: 'execute_command',
      arguments: {
        window_id: windowId,
        command,
        timeout
      }
    });
    
    // Parse the MCP response format
    if (!response || !response.content || !response.content[0]) {
      throw new Error(`Invalid response from execute_command: ${JSON.stringify(response)}`);
    }
    
    const result = JSON.parse(response.content[0].text);
    return result.output;
  }

  /**
   * Call the read_output tool
   */
  async readOutput(windowId: string, historyLimit?: number): Promise<string> {
    const response = await this.sendRequest<any>('tools/call', {
      name: 'read_output',
      arguments: {
        window_id: windowId,
        history_limit: historyLimit
      }
    });
    
    // Parse the MCP response format
    if (!response || !response.content || !response.content[0]) {
      throw new Error(`Invalid response from read_output: ${JSON.stringify(response)}`);
    }
    
    const result = JSON.parse(response.content[0].text);
    return result.content;
  }
}
