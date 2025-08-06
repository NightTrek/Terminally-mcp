/**
 * E2E Tests for Terminally-mcp
 * 
 * These tests start the MCP server in a subprocess and communicate with it
 * to test its functionality.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { McpServerTestHarness } from '../utils/mcpServerTestHarness';

describe('Terminally-mcp E2E Tests', () => {
  // Shared test harness
  const harness = new McpServerTestHarness();
  
  // Store tab IDs for cleanup
  const createdTabs: string[] = [];

  beforeAll(async () => {
    // Start the MCP server before all tests
    await harness.start();
  }, 15000); // Longer timeout for server startup

  afterAll(async () => {
    // Stop the MCP server after all tests
    await harness.stop();
  });

  afterEach(async () => {
    // Clean up any tabs created during tests
    for (const tabId of createdTabs) {
      try {
        await harness.closeTab(tabId);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    // Clear the array
    createdTabs.length = 0;
  });

  describe('Tab Management', () => {
    test('should create a tab with default name', async () => {
      // Create a tab
      const tabId = await harness.createTab();
      createdTabs.push(tabId);
      
      // Verify tab exists
      expect(tabId).toBeDefined();
      expect(tabId).toMatch(/^@\d+$/); // Tab IDs should look like @0, @1, etc.
    });

    test('should create a tab with custom name', async () => {
      // Create a tab with custom name
      const tabName = 'test-tab';
      const tabId = await harness.createTab(tabName);
      createdTabs.push(tabId);
      
      // Get list of tabs
      const tabs = await harness.listTabs();
      
      // Find our tab in the list
      const createdTab = tabs.find(tab => tab.window_id === tabId);
      
      // Verify tab exists with correct name
      expect(createdTab).toBeDefined();
      expect(createdTab?.name).toBe(tabName);
    });

    test('should list all tabs', async () => {
      // Create two tabs
      const tabId1 = await harness.createTab('tab1');
      const tabId2 = await harness.createTab('tab2');
      createdTabs.push(tabId1, tabId2);
      
      // Get list of tabs
      const tabs = await harness.listTabs();
      
      // Verify both tabs are in the list
      expect(tabs.some(tab => tab.window_id === tabId1)).toBe(true);
      expect(tabs.some(tab => tab.window_id === tabId2)).toBe(true);
      
      // Verify tab names
      expect(tabs.find(tab => tab.window_id === tabId1)?.name).toBe('tab1');
      expect(tabs.find(tab => tab.window_id === tabId2)?.name).toBe('tab2');
    });

    test('should close a tab', async () => {
      // Create a tab
      const tabId = await harness.createTab('to-be-closed');
      
      // Close the tab
      const success = await harness.closeTab(tabId);
      
      // Verify success
      expect(success).toBe(true);
      
      // Verify tab no longer exists in list
      const tabs = await harness.listTabs();
      expect(tabs.some(tab => tab.window_id === tabId)).toBe(false);
    });
  });

  describe('Command Execution', () => {
    test('should execute a command in a tab', async () => {
      // Create a tab
      const tabId = await harness.createTab('command-test');
      createdTabs.push(tabId);
      
      // Execute an echo command
      const rawOutput = await harness.executeCommand(tabId, 'echo "Hello, World!"');
      
      // Verify raw output contains the expected text (somewhere)
      expect(rawOutput).toContain('Hello, World!');
    });

    test('should execute multiple commands in sequence', async () => {
      // Create a tab
      const tabId = await harness.createTab('multi-command-test');
      createdTabs.push(tabId);
      
      // Execute first command (create a file)
      await harness.executeCommand(tabId, 'echo "test content" > test_file.txt');
      
      // Execute second command (read the file)
      const rawOutput = await harness.executeCommand(tabId, 'cat test_file.txt');
      
      // Verify raw output contains the file content
      expect(rawOutput).toContain('test content');
      
      // Clean up - remove the file
      await harness.executeCommand(tabId, 'rm test_file.txt');
    });

    test('should handle command timeout appropriately', async () => {
      // Create a tab
      const tabId = await harness.createTab('timeout-test');
      createdTabs.push(tabId);
      
      // Execute a command that will produce output after some delay
      const rawOutput = await harness.executeCommand(tabId, 'sleep 1 && echo "Delayed output"', 3000);
      
      // Verify the raw output contains the delayed text
      expect(rawOutput).toContain('Delayed output');
    });
  });

  describe('Output Reading', () => {
    test('should read output from a tab', async () => {
      // Create a tab
      const tabId = await harness.createTab('output-test');
      createdTabs.push(tabId);
      
      // Generate some output
      await harness.executeCommand(tabId, 'echo "Line 1" && echo "Line 2" && echo "Line 3"');
      
      // Read the output
      const content = await harness.readOutput(tabId);
      
      // Verify content
      expect(content).toContain('Line 1');
      expect(content).toContain('Line 2');
      expect(content).toContain('Line 3');
    });

    test('should read limited history output', async () => {
      // Create a tab
      const tabId = await harness.createTab('history-test');
      createdTabs.push(tabId);
      
      // Generate a bunch of output lines
      for (let i = 1; i <= 10; i++) {
        await harness.executeCommand(tabId, `echo "Line ${i}"`);
      }
      
      // Read limited history (last 5 lines)
      const content = await harness.readOutput(tabId, 5);
      
      // When we read with a history limit, we should get the most recent output
      // The exact lines we get may vary due to shell prompts and markers
      // But we should definitely see the most recent lines
      expect(content).toContain('Line 10');
      expect(content).toContain('Line 9');
      
      // The content should be limited - it shouldn't be too long
      // (5 lines of history should be much shorter than all 10 lines)
      const lines = content.split('\n');
      expect(lines.length).toBeLessThan(20); // Should have fewer lines than if we got all output
    }, 30000); // Increased timeout to 30 seconds for this long test
  });

  describe('Error Handling', () => {
    test('should handle non-existent tab ID gracefully', async () => {
      // Attempt to execute command in non-existent tab
      try {
        await harness.executeCommand('@999', 'echo "test"');
        // If we reach here, the test failed
        expect(true).toBe(false);
      } catch (error) {
        // Expect an error
        expect(error).toBeDefined();
      }
    });

    test('should handle invalid commands gracefully', async () => {
      // Create a tab
      const tabId = await harness.createTab('error-test');
      createdTabs.push(tabId);
      
      // Execute an invalid command
      const output = await harness.executeCommand(tabId, 'command_that_does_not_exist');
      
      // Verify raw output contains the shell's error message
      expect(output).toContain('command not found'); // zsh error message
    });
  });
});
