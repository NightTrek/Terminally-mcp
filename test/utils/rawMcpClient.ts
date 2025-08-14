/**
 * Raw MCP Client for Protocol Testing
 * 
 * This client provides low-level access to the MCP protocol without
 * any abstraction or interference, allowing us to test protocol compliance
 * directly.
 */
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { join } from 'path';
import { setTimeout as sleep } from 'timers/promises';
import { v4 as uuidv4 } from 'uuid';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class RawMcpClient {
  private serverProcess: ChildProcessWithoutNullStreams | null = null;
  private responseBuffer: string = '';
  private pendingRequests: Map<string, {
    resolve: (value: JsonRpcResponse) => void;
    reject: (reason: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private serverLogs: string[] = [];
  private isReady = false;

  /**
   * Start the MCP server and establish raw connection
   */
  async connect(): Promise<void> {
    // Start the server process
    this.serverProcess = spawn('node', [join(process.cwd(), 'build', 'index.js')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });

    // Capture stderr for debugging
    this.serverProcess.stderr.on('data', (data) => {
      const log = data.toString();
      this.serverLogs.push(`[stderr] ${log}`);
    });

    // Handle stdout for JSON-RPC responses
    this.serverProcess.stdout.on('data', (data) => {
      const dataStr = data.toString();
      this.responseBuffer += dataStr;
      
      // Check for server ready messages in stdout
      if (dataStr.includes('tmux server started') || 
          dataStr.includes('Terminally-mcp server running on stdio') ||
          dataStr.includes('Initializing MCP server')) {
        this.isReady = true;
      }
      
      this.processResponseBuffer();
    });

    // Handle process exit
    this.serverProcess.on('exit', (code) => {
      this.isReady = false;
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(`Server exited with code ${code}`));
      }
      this.pendingRequests.clear();
    });

    // Wait for server to be ready
    let retries = 0;
    while (!this.isReady && retries < 30) {
      await sleep(200);
      retries++;
    }

    if (!this.isReady) {
      throw new Error('Server failed to start within timeout');
    }

    // Give it a bit more time to fully initialize
    await sleep(500);
  }

  /**
   * Process the response buffer for complete JSON-RPC messages
   */
  private processResponseBuffer(): void {
    const lines = this.responseBuffer.split('\n');
    this.responseBuffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response = JSON.parse(line) as JsonRpcResponse;
        
        // Check if this is a valid JSON-RPC response
        if (response.jsonrpc === '2.0' && response.id) {
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(response.id);
            pending.resolve(response);
          }
        }
      } catch (error) {
        // Not valid JSON, might be debug output
        this.serverLogs.push(`[stdout-non-json] ${line}`);
      }
    }
  }

  /**
   * Send a raw JSON-RPC request and get the raw response
   */
  async sendRawRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.serverProcess || !this.isReady) {
      throw new Error('Server is not connected');
    }

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`Request timeout for ${request.method}`));
      }, 10000);

      // Store pending request
      this.pendingRequests.set(request.id, { resolve, reject, timeout });

      // Send request
      const requestStr = JSON.stringify(request) + '\n';
      this.serverProcess!.stdin.write(requestStr);
    });
  }

  /**
   * Send a request with auto-generated ID
   */
  async sendRequest(method: string, params?: any): Promise<JsonRpcResponse> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method,
      params
    };
    return this.sendRawRequest(request);
  }

  /**
   * Send a malformed request (for error testing)
   */
  async sendMalformedRequest(data: string): Promise<JsonRpcResponse | null> {
    if (!this.serverProcess || !this.isReady) {
      throw new Error('Server is not connected');
    }

    // Try to extract an ID if possible for tracking
    let id: string | null = null;
    try {
      const parsed = JSON.parse(data);
      id = parsed.id;
    } catch {
      // Malformed JSON, can't extract ID
    }

    if (id) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(id!);
          resolve(null); // Timeout means no response
        }, 2000);

        this.pendingRequests.set(id, { resolve, reject, timeout });
        this.serverProcess!.stdin.write(data + '\n');
      });
    } else {
      // No ID, just send and don't expect a response
      this.serverProcess!.stdin.write(data + '\n');
      await sleep(500); // Give it time to process
      return null;
    }
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
      this.isReady = false;
      
      // Clear pending requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Client disconnected'));
      }
      this.pendingRequests.clear();
    }
  }

  /**
   * Get server logs for debugging
   */
  getServerLogs(): string[] {
    return [...this.serverLogs];
  }

  /**
   * Clear server logs
   */
  clearServerLogs(): void {
    this.serverLogs = [];
  }
}
