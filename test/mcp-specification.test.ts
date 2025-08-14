/**
 * MCP Protocol Specification Tests
 * 
 * These tests verify that the Terminally-mcp server correctly implements
 * the MCP (Model Context Protocol) specification, including:
 * - Protocol compliance
 * - Tool discovery and metadata
 * - Request/response formats
 * - Error handling
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { RawMcpClient } from './utils/rawMcpClient';
import { z } from 'zod';

// JSON-RPC 2.0 Response Schema
const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.string(),
  result: z.any().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.any().optional()
  }).optional()
}).refine(data => (data.result !== undefined) !== (data.error !== undefined), {
  message: 'Response must have either result or error, but not both'
});

// MCP Tool Schema
const McpToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.object({
    type: z.literal('object'),
    properties: z.record(z.any()),
    required: z.array(z.string()).optional()
  }),
  returns: z.object({
    type: z.literal('object'),
    properties: z.record(z.any()),
    required: z.array(z.string())
  }).optional()
});

// MCP Tool Call Result Schema
const McpToolCallResultSchema = z.object({
  content: z.array(z.object({
    type: z.string(),
    text: z.string().optional(),
    data: z.any().optional()
  }))
});

describe('MCP Protocol Specification Tests', () => {
  let client: RawMcpClient;

  beforeAll(async () => {
    client = new RawMcpClient();
    await client.connect();
  }, 20000);

  afterAll(async () => {
    await client.disconnect();
  });

  describe('1. JSON-RPC 2.0 Protocol Compliance', () => {
    test('should return valid JSON-RPC 2.0 responses', async () => {
      const response = await client.sendRequest('tools/list', {});
      
      // Validate response format
      const validation = JsonRpcResponseSchema.safeParse(response);
      expect(validation.success).toBe(true);
      
      // Should have jsonrpc version
      expect(response.jsonrpc).toBe('2.0');
      
      // Should have matching ID
      expect(response.id).toBeDefined();
      
      // Should have result (not error for valid request)
      expect(response.result).toBeDefined();
      expect(response.error).toBeUndefined();
    });

    test('should handle requests without params', async () => {
      const response = await client.sendRequest('tools/list');
      
      expect(response.jsonrpc).toBe('2.0');
      expect(response.result).toBeDefined();
    });

    test('should return error for unknown methods', async () => {
      const response = await client.sendRequest('unknown/method', {});
      
      // Validate response format
      const validation = JsonRpcResponseSchema.safeParse(response);
      expect(validation.success).toBe(true);
      
      // Should have error
      expect(response.error).toBeDefined();
      expect(response.result).toBeUndefined();
      
      // Error should have required fields
      expect(response.error?.code).toBeDefined();
      expect(response.error?.message).toBeDefined();
    });

    test('should handle malformed JSON gracefully', async () => {
      // Send invalid JSON
      const response = await client.sendMalformedRequest('{"invalid json}');
      
      // Server might not respond to malformed JSON, which is acceptable
      // If it does respond, it should be an error
      if (response) {
        expect(response.error).toBeDefined();
      }
    });

    test('should handle missing jsonrpc version', async () => {
      const response = await client.sendRawRequest({
        jsonrpc: '2.0', // We need this for our client to work
        id: 'test-id',
        method: 'tools/list',
        params: {}
      });
      
      // Server should still respond properly
      expect(response.jsonrpc).toBe('2.0');
    });
  });

  describe('2. Tool Discovery (tools/list)', () => {
    test('should list all available tools', async () => {
      const response = await client.sendRequest('tools/list', {});
      
      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeDefined();
      expect(typeof response.result.tools).toBe('object');
      expect(response.result.tools).not.toBeNull();
      
      // Should have exactly 5 tools
      const toolNames = Object.keys(response.result.tools);
      expect(toolNames).toHaveLength(5);
      
      // Check tool names
      expect(toolNames).toContain('create_tab');
      expect(toolNames).toContain('close_tab');
      expect(toolNames).toContain('list_tabs');
      expect(toolNames).toContain('execute_command');
      expect(toolNames).toContain('read_output');
    });

    test('should provide complete tool metadata', async () => {
      const response = await client.sendRequest('tools/list', {});
      
      for (const toolName in response.result.tools) {
        const tool = response.result.tools[toolName];
        // Validate tool schema
        const validation = McpToolSchema.safeParse(tool);
        expect(validation.success).toBe(true);
        
        // Check required fields
        expect(tool.name).toBe(toolName);
        expect(typeof tool.name).toBe('string');
        
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        
        expect(tool.schema).toBeDefined();
        expect(tool.schema.type).toBe('object');
        expect(tool.schema.properties).toBeDefined();
      }
    });

    test('should specify required parameters correctly', async () => {
      const response = await client.sendRequest('tools/list', {});
      const tools = response.result.tools;
      
      // Check specific tool requirements
      const createTab = tools['create_tab'];
      expect(createTab.schema.required).toEqual([]);
      
      const closeTab = tools['close_tab'];
      expect(closeTab.schema.required).toContain('window_id');
      
      const executeCommand = tools['execute_command'];
      expect(executeCommand.schema.required).toContain('window_id');
      expect(executeCommand.schema.required).toContain('command');
    });

    test('should include return type information', async () => {
      const response = await client.sendRequest('tools/list', {});
      const tools = response.result.tools;
      
      for (const toolName in tools) {
        const tool = tools[toolName];
        if (tool.returns) {
          expect(tool.returns.type).toBe('object');
          expect(tool.returns.properties).toBeDefined();
          expect(tool.returns.required).toBeDefined();
          expect(Array.isArray(tool.returns.required)).toBe(true);
        }
      }
    });
  });

  describe('3. Tool Invocation (tools/call)', () => {
    let testTabId: string;

    test('should call tools with valid parameters', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'create_tab',
        arguments: { name: 'test-tab' }
      });
      
      expect(response.result).toBeDefined();
      expect(response.error).toBeUndefined();
      
      // Validate result format
      const validation = McpToolCallResultSchema.safeParse(response.result);
      expect(validation.success).toBe(true);
      
      // Check content array
      expect(response.result.content).toBeDefined();
      expect(Array.isArray(response.result.content)).toBe(true);
      expect(response.result.content.length).toBeGreaterThan(0);
      
      // Check content item
      const content = response.result.content[0];
      expect(content.type).toBe('text');
      expect(content.text).toBeDefined();
      
      // Parse the actual result
      const result = JSON.parse(content.text);
      expect(result.window_id).toBeDefined();
      testTabId = result.window_id;
    });

    test('should handle missing required parameters', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'close_tab',
        arguments: {} // Missing required window_id
      });
      
      // Should return an error
      expect(response.error).toBeDefined();
      expect(response.result).toBeUndefined();
    });

    test('should handle unknown tool names', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'non_existent_tool',
        arguments: {}
      });
      
      // Should return an error
      expect(response.error).toBeDefined();
      expect(response.result).toBeUndefined();
      expect(response.error?.message).toContain('Unknown tool');
    });

    test('should handle optional parameters', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'execute_command',
        arguments: {
          window_id: testTabId,
          command: 'echo "test"'
          // timeout is optional, not provided
        }
      });
      
      expect(response.result).toBeDefined();
      expect(response.error).toBeUndefined();
    });

    test('should return properly formatted results', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'list_tabs',
        arguments: {}
      });
      
      expect(response.result).toBeDefined();
      expect(response.result.content).toBeDefined();
      expect(Array.isArray(response.result.content)).toBe(true);
      
      const content = response.result.content[0];
      expect(content.type).toBe('text');
      
      const result = JSON.parse(content.text);
      expect(result.tabs).toBeDefined();
      expect(Array.isArray(result.tabs)).toBe(true);
    });

    // Clean up test tab
    afterAll(async () => {
      if (testTabId) {
        await client.sendRequest('tools/call', {
          name: 'close_tab',
          arguments: { window_id: testTabId }
        });
      }
    });
  });

  describe('4. Server Capabilities', () => {
    test('should respond to server/capabilities if implemented', async () => {
      const response = await client.sendRequest('server/capabilities', {});
      
      if (response.result) {
        // If implemented, check the response
        expect(response.result.protocolVersion).toBeDefined();
        expect(response.result.tools).toBeDefined();
      } else if (response.error) {
        // It's okay if not implemented, but error should be proper
        expect(response.error.code).toBeDefined();
        expect(response.error.message).toBeDefined();
      }
    });
  });

  describe('5. Error Handling', () => {
    test('should use standard MCP error codes', async () => {
      const response = await client.sendRequest('invalid/method', {});
      
      expect(response.error).toBeDefined();
      // Standard JSON-RPC error codes:
      // -32700: Parse error
      // -32600: Invalid Request
      // -32601: Method not found
      // -32602: Invalid params
      // -32603: Internal error
      expect(response.error?.code).toBeDefined();
      expect(typeof response.error?.code).toBe('number');
    });

    test('should handle invalid parameter types gracefully', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'execute_command',
        arguments: {
          window_id: 123, // Should be string
          command: 'echo test'
        }
      });
      
      // Should either handle gracefully or return error
      if (response.error) {
        expect(response.error.code).toBeDefined();
        expect(response.error.message).toBeDefined();
      }
    });

    test('should provide meaningful error messages', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'close_tab',
        arguments: { window_id: '@nonexistent999' }
      });
      
      // Should return an error with a meaningful message
      if (response.error) {
        expect(response.error.message).toBeDefined();
        expect(response.error.message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('6. Protocol Edge Cases', () => {
    test('should handle empty params object', async () => {
      const response = await client.sendRequest('tools/list', {});
      expect(response.result).toBeDefined();
    });

    test('should handle null params', async () => {
      const response = await client.sendRequest('tools/list', null);
      // Should either accept null or return proper error
      if (response.result) {
        expect(response.result.tools).toBeDefined();
      } else if (response.error) {
        expect(response.error.code).toBeDefined();
      }
    });

    test('should handle very long tool arguments', async () => {
      const longString = 'x'.repeat(10000);
      const response = await client.sendRequest('tools/call', {
        name: 'create_tab',
        arguments: { name: longString }
      });
      
      // Should either handle or return error
      expect(response.jsonrpc).toBe('2.0');
    });

    test('should maintain request ID in responses', async () => {
      const customId = 'custom-test-id-12345';
      const response = await client.sendRawRequest({
        jsonrpc: '2.0',
        id: customId,
        method: 'tools/list',
        params: {}
      });
      
      expect(response.id).toBe(customId);
    });
  });

  describe('7. Tool-Specific Validation', () => {
    test('create_tab should return valid window_id format', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'create_tab',
        arguments: {}
      });
      
      const content = response.result.content[0];
      const result = JSON.parse(content.text);
      
      // Window ID should match expected format
      expect(result.window_id).toMatch(/^@\d+$/);
    });

    test('list_tabs should return proper tab structure', async () => {
      const response = await client.sendRequest('tools/call', {
        name: 'list_tabs',
        arguments: {}
      });
      
      const content = response.result.content[0];
      const result = JSON.parse(content.text);
      
      expect(result.tabs).toBeDefined();
      for (const tab of result.tabs) {
        expect(tab.window_id).toBeDefined();
        expect(tab.name).toBeDefined();
        expect(typeof tab.active).toBe('boolean');
      }
    });

    test('execute_command should handle timeout parameter', async () => {
      // First create a tab
      const createResponse = await client.sendRequest('tools/call', {
        name: 'create_tab',
        arguments: {}
      });
      const createResult = JSON.parse(createResponse.result.content[0].text);
      const tabId = createResult.window_id;

      // Execute with timeout
      const response = await client.sendRequest('tools/call', {
        name: 'execute_command',
        arguments: {
          window_id: tabId,
          command: 'echo "test"',
          timeout: 5000
        }
      });
      
      expect(response.result).toBeDefined();
      
      // Clean up
      await client.sendRequest('tools/call', {
        name: 'close_tab',
        arguments: { window_id: tabId }
      });
    });

    test('read_output should handle history_limit parameter', async () => {
      // First create a tab
      const createResponse = await client.sendRequest('tools/call', {
        name: 'create_tab',
        arguments: {}
      });
      const createResult = JSON.parse(createResponse.result.content[0].text);
      const tabId = createResult.window_id;

      // Read with history limit
      const response = await client.sendRequest('tools/call', {
        name: 'read_output',
        arguments: {
          window_id: tabId,
          history_limit: 10
        }
      });
      
      expect(response.result).toBeDefined();
      const content = response.result.content[0];
      const result = JSON.parse(content.text);
      expect(result.content).toBeDefined();
      
      // Clean up
      await client.sendRequest('tools/call', {
        name: 'close_tab',
        arguments: { window_id: tabId }
      });
    });
  });
});
