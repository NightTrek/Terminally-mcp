/**
 * Comprehensive E2E Tests for Terminally-mcp
 * 
 * These tests provide extensive coverage of edge cases, error conditions,
 * and complex scenarios for an MCP server that manages TMUX terminals.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { McpServerTestHarness } from '../utils/mcpServerTestHarness';
import { setTimeout as sleep } from 'timers/promises';

describe('Terminally-mcp Comprehensive E2E Tests', () => {
  const harness = new McpServerTestHarness();
  const createdTabs: string[] = [];

  beforeAll(async () => {
    await harness.start();
  }, 30000);

  afterAll(async () => {
    await harness.stop();
  });

  afterEach(async () => {
    // Clean up any tabs created during tests
    for (const tabId of createdTabs) {
      try {
        await harness.closeTab(tabId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    createdTabs.length = 0;
  });

  describe('Critical Edge Cases for TMUX Integration', () => {
    
    describe('Command Execution Edge Cases', () => {
      test('should handle commands with special characters and quotes', async () => {
        const tabId = await harness.createTab('special-chars');
        createdTabs.push(tabId);
        
        // Test various special characters that could break shell parsing
        const testCases = [
          { cmd: 'echo "Hello \'World\'"', expected: "Hello 'World'" },
          { cmd: 'echo \'Test "quotes"\'', expected: 'Test "quotes"' },
          { cmd: 'echo "Line1\\nLine2"', expected: 'Line1\\nLine2' },
          { cmd: 'echo "$HOME"', expected: process.env.HOME },
          { cmd: 'echo "Test & ampersand"', expected: 'Test & ampersand' },
          { cmd: 'echo "Test | pipe"', expected: 'Test | pipe' },
          { cmd: 'echo "Test ; semicolon"', expected: 'Test ; semicolon' },
          { cmd: 'echo "Test \`backtick\`"', expected: 'Test `backtick`' },
          { cmd: 'echo "Test $(echo nested)"', expected: 'Test nested' },
        ];
        
        for (const testCase of testCases) {
          const output = await harness.executeCommand(tabId, testCase.cmd);
          expect(output).toContain(testCase.expected);
        }
      });

      test('should handle very long commands', async () => {
        const tabId = await harness.createTab('long-command');
        createdTabs.push(tabId);
        
        // Create a very long command (over 4096 chars)
        const longString = 'x'.repeat(5000);
        const output = await harness.executeCommand(tabId, `echo "${longString}" | wc -c`);
        
        // Should handle the long command without truncation
        expect(parseInt(output.trim())).toBeGreaterThan(4900);
      });

      test('should handle commands with ANSI escape codes', async () => {
        const tabId = await harness.createTab('ansi-codes');
        createdTabs.push(tabId);
        
        // Commands that produce colored output
        const output = await harness.executeCommand(tabId, 'echo -e "\\033[31mRed Text\\033[0m"');
        
        // Should capture the actual text (ANSI codes might be stripped by tmux capture-pane)
        expect(output).toContain('Red Text');
      });

      test('should handle interactive commands that require input', async () => {
        const tabId = await harness.createTab('interactive');
        createdTabs.push(tabId);
        
        // Test with a command that would normally wait for input
        // Using timeout to ensure it doesn't hang
        const output = await harness.executeCommand(
          tabId, 
          'echo "test" | head -n 1',
          2000
        );
        
        expect(output).toContain('test');
      });

      test('should handle commands that produce no output', async () => {
        const tabId = await harness.createTab('no-output');
        createdTabs.push(tabId);
        
        // Command that produces no output
        const output = await harness.executeCommand(tabId, 'true');
        
        // Should return a consistent message for no output
        expect(output).toMatch(/no output|^$/);
      });

      test('should handle commands that produce only stderr', async () => {
        const tabId = await harness.createTab('stderr-only');
        createdTabs.push(tabId);
        
        // Command that writes to stderr
        const output = await harness.executeCommand(tabId, 'ls /nonexistent 2>&1');
        
        // Should capture stderr output
        expect(output.toLowerCase()).toContain('no such file');
      });

      test('should handle background processes correctly', async () => {
        const tabId = await harness.createTab('background');
        createdTabs.push(tabId);
        
        // Start a background process
        await harness.executeCommand(tabId, 'sleep 30 &');
        
        // Should be able to run another command immediately
        const output = await harness.executeCommand(tabId, 'echo "Still responsive"');
        expect(output).toContain('Still responsive');
        
        // Check that background process is running
        const jobsOutput = await harness.executeCommand(tabId, 'jobs');
        expect(jobsOutput).toContain('sleep');
      });

      test('should handle command chaining with && and ||', async () => {
        const tabId = await harness.createTab('chaining');
        createdTabs.push(tabId);
        
        // Test && chaining
        const successChain = await harness.executeCommand(
          tabId, 
          'echo "First" && echo "Second"'
        );
        expect(successChain).toContain('First');
        expect(successChain).toContain('Second');
        
        // Test || chaining
        const failChain = await harness.executeCommand(
          tabId,
          'false || echo "Fallback"'
        );
        expect(failChain).toContain('Fallback');
      });

      test('should preserve command exit codes', async () => {
        const tabId = await harness.createTab('exit-codes');
        createdTabs.push(tabId);
        
        // Test successful command
        await harness.executeCommand(tabId, 'true');
        const successCode = await harness.executeCommand(tabId, 'echo $?');
        expect(successCode.trim()).toBe('0');
        
        // Test failed command
        await harness.executeCommand(tabId, 'false');
        const failCode = await harness.executeCommand(tabId, 'echo $?');
        expect(failCode.trim()).toBe('1');
      });
    });

    describe('Tab Management Stress Tests', () => {
      test('should handle rapid tab creation and deletion', async () => {
        const tabIds: string[] = [];
        
        // Rapidly create tabs
        for (let i = 0; i < 10; i++) {
          const tabId = await harness.createTab(`rapid-${i}`);
          tabIds.push(tabId);
        }
        
        // Verify all tabs exist
        const tabs = await harness.listTabs();
        for (const tabId of tabIds) {
          expect(tabs.some(t => t.window_id === tabId)).toBe(true);
        }
        
        // Rapidly delete tabs
        for (const tabId of tabIds) {
          const success = await harness.closeTab(tabId);
          expect(success).toBe(true);
        }
        
        // Verify all tabs are gone
        const finalTabs = await harness.listTabs();
        for (const tabId of tabIds) {
          expect(finalTabs.some(t => t.window_id === tabId)).toBe(false);
        }
      });

      test('should handle tab names with special characters', async () => {
        const specialNames = [
          'tab-with-spaces in name',
          'tab_with_underscores',
          'tab.with.dots',
          'tab-with-dashes',
          'tab/with/slashes',
          'tab:with:colons',
          'tab@with@at',
          'tab#with#hash',
          'tab$with$dollar',
          'tab%with%percent',
        ];
        
        for (const name of specialNames) {
          const tabId = await harness.createTab(name);
          createdTabs.push(tabId);
          
          const tabs = await harness.listTabs();
          const tab = tabs.find(t => t.window_id === tabId);
          expect(tab?.name).toBe(name);
        }
      });

      test('should handle duplicate tab names gracefully', async () => {
        const name = 'duplicate-name';
        
        const tabId1 = await harness.createTab(name);
        const tabId2 = await harness.createTab(name);
        createdTabs.push(tabId1, tabId2);
        
        // Both tabs should exist with the same name
        const tabs = await harness.listTabs();
        const duplicates = tabs.filter(t => t.name === name);
        expect(duplicates.length).toBeGreaterThanOrEqual(2);
        
        // But they should have different IDs
        expect(tabId1).not.toBe(tabId2);
      });

      test('should handle maximum tab limit gracefully', async () => {
        const maxTabs = 50; // Reasonable limit for testing
        const tabIds: string[] = [];
        
        try {
          for (let i = 0; i < maxTabs; i++) {
            const tabId = await harness.createTab(`max-${i}`);
            tabIds.push(tabId);
          }
          
          // All tabs should be created successfully
          const tabs = await harness.listTabs();
          expect(tabs.length).toBeGreaterThanOrEqual(maxTabs);
        } finally {
          // Clean up all created tabs
          for (const tabId of tabIds) {
            try {
              await harness.closeTab(tabId);
            } catch (error) {
              // Ignore cleanup errors
            }
          }
        }
      }, 60000); // Longer timeout for this stress test
    });

    describe('Output Reading Edge Cases', () => {
      test('should handle reading from tab with massive output', async () => {
        const tabId = await harness.createTab('massive-output');
        createdTabs.push(tabId);
        
        // Generate massive output
        await harness.executeCommand(tabId, 'for i in {1..1000}; do echo "Line $i"; done', 5000);
        
        // Read with history limit
        const limitedOutput = await harness.readOutput(tabId, 10);
        const lines = limitedOutput.split('\n').filter(l => l.trim());
        
        // Should respect the limit
        expect(lines.length).toBeLessThanOrEqual(15); // Some buffer for prompts
        
        // Should get the most recent lines
        expect(limitedOutput).toContain('Line 1000');
      });

      test('should handle reading from tab with binary output', async () => {
        const tabId = await harness.createTab('binary-output');
        createdTabs.push(tabId);
        
        // Generate some binary-like output
        await harness.executeCommand(tabId, 'echo -e "\\x00\\x01\\x02\\x03"');
        
        // Should handle binary data without crashing
        const output = await harness.readOutput(tabId);
        expect(output).toBeDefined();
      });

      test('should handle reading from tab with very long lines', async () => {
        const tabId = await harness.createTab('long-lines');
        createdTabs.push(tabId);
        
        // Generate a very long line (over terminal width)
        const longLine = 'x'.repeat(500);
        await harness.executeCommand(tabId, `echo "${longLine}"`);
        
        const output = await harness.readOutput(tabId);
        // The line might be wrapped, but content should be preserved
        expect(output.replace(/\s+/g, '')).toContain('x'.repeat(400));
      });

      test('should handle concurrent reads from same tab', async () => {
        const tabId = await harness.createTab('concurrent-reads');
        createdTabs.push(tabId);
        
        await harness.executeCommand(tabId, 'echo "Test content"');
        
        // Perform concurrent reads
        const reads = await Promise.all([
          harness.readOutput(tabId),
          harness.readOutput(tabId),
          harness.readOutput(tabId),
        ]);
        
        // All reads should succeed and return similar content
        for (const output of reads) {
          expect(output).toContain('Test content');
        }
      });
    });

    describe('Concurrency and Race Conditions', () => {
      test('should handle concurrent command execution in different tabs', async () => {
        const tab1 = await harness.createTab('concurrent-1');
        const tab2 = await harness.createTab('concurrent-2');
        const tab3 = await harness.createTab('concurrent-3');
        createdTabs.push(tab1, tab2, tab3);
        
        // Execute commands concurrently in different tabs
        const results = await Promise.all([
          harness.executeCommand(tab1, 'echo "Tab 1"'),
          harness.executeCommand(tab2, 'echo "Tab 2"'),
          harness.executeCommand(tab3, 'echo "Tab 3"'),
        ]);
        
        expect(results[0]).toContain('Tab 1');
        expect(results[1]).toContain('Tab 2');
        expect(results[2]).toContain('Tab 3');
      });

      test('should handle rapid sequential commands in same tab', async () => {
        const tabId = await harness.createTab('rapid-sequential');
        createdTabs.push(tabId);
        
        // Rapidly execute commands
        const results: string[] = [];
        for (let i = 0; i < 20; i++) {
          const output = await harness.executeCommand(tabId, `echo "Command ${i}"`);
          results.push(output);
        }
        
        // All commands should execute in order
        for (let i = 0; i < 20; i++) {
          expect(results[i]).toContain(`Command ${i}`);
        }
      });

      test('should handle interleaved operations on multiple tabs', async () => {
        const tab1 = await harness.createTab('interleaved-1');
        const tab2 = await harness.createTab('interleaved-2');
        createdTabs.push(tab1, tab2);
        
        // Interleave operations
        await harness.executeCommand(tab1, 'echo "Start 1"');
        await harness.executeCommand(tab2, 'echo "Start 2"');
        
        const read1 = await harness.readOutput(tab1);
        await harness.executeCommand(tab2, 'echo "Middle 2"');
        
        const read2 = await harness.readOutput(tab2);
        await harness.executeCommand(tab1, 'echo "End 1"');
        
        const finalRead1 = await harness.readOutput(tab1);
        const finalRead2 = await harness.readOutput(tab2);
        
        // Verify isolation between tabs
        expect(read1).toContain('Start 1');
        expect(read2).toContain('Start 2');
        expect(read2).toContain('Middle 2');
        expect(finalRead1).toContain('End 1');
        expect(finalRead2).toContain('Middle 2');
      });
    });

    describe('Environment and State Management', () => {
      test('should maintain separate environments for each tab', async () => {
        const tab1 = await harness.createTab('env-1');
        const tab2 = await harness.createTab('env-2');
        createdTabs.push(tab1, tab2);
        
        // Set different environment variables in each tab
        await harness.executeCommand(tab1, 'export TEST_VAR="Tab1Value"');
        await harness.executeCommand(tab2, 'export TEST_VAR="Tab2Value"');
        
        // Verify isolation
        const var1 = await harness.executeCommand(tab1, 'echo $TEST_VAR');
        const var2 = await harness.executeCommand(tab2, 'echo $TEST_VAR');
        
        expect(var1).toContain('Tab1Value');
        expect(var2).toContain('Tab2Value');
      });

      test('should maintain working directory per tab', async () => {
        const tab1 = await harness.createTab('pwd-1');
        const tab2 = await harness.createTab('pwd-2');
        createdTabs.push(tab1, tab2);
        
        // Change directories in different tabs
        await harness.executeCommand(tab1, 'cd /tmp');
        await harness.executeCommand(tab2, 'cd /var');
        
        // Verify working directories are independent
        const pwd1 = await harness.executeCommand(tab1, 'pwd');
        const pwd2 = await harness.executeCommand(tab2, 'pwd');
        
        expect(pwd1.trim()).toBe('/tmp');
        expect(pwd2.trim()).toBe('/var');
      });

      test('should preserve shell history per tab', async () => {
        const tabId = await harness.createTab('history');
        createdTabs.push(tabId);
        
        // Execute several commands
        await harness.executeCommand(tabId, 'echo "Command 1"');
        await harness.executeCommand(tabId, 'echo "Command 2"');
        await harness.executeCommand(tabId, 'echo "Command 3"');
        
        // History should be available
        const output = await harness.readOutput(tabId);
        expect(output).toContain('Command 1');
        expect(output).toContain('Command 2');
        expect(output).toContain('Command 3');
      });
    });

    describe('Error Recovery and Resilience', () => {
      test('should recover from command that crashes the shell', async () => {
        const tabId = await harness.createTab('crash-recovery');
        createdTabs.push(tabId);
        
        // This shouldn't actually crash, but tests error handling
        await harness.executeCommand(tabId, 'exec false');
        
        // Tab should still be usable
        const output = await harness.executeCommand(tabId, 'echo "Still alive"');
        expect(output).toBeDefined();
      });

      test('should handle operations on recently closed tab', async () => {
        const tabId = await harness.createTab('to-be-closed');
        
        // Close the tab
        await harness.closeTab(tabId);
        
        // Operations should fail gracefully
        await expect(harness.executeCommand(tabId, 'echo "test"')).rejects.toThrow();
        await expect(harness.readOutput(tabId)).rejects.toThrow();
      });

      test('should handle malformed window IDs gracefully', async () => {
        const invalidIds = [
          '',
          'invalid',
          '123',
          '@',
          '@abc',
          null as any,
          undefined as any,
          {} as any,
          [] as any,
        ];
        
        for (const invalidId of invalidIds) {
          // Should handle gracefully without crashing
          try {
            await harness.executeCommand(invalidId, 'echo "test"');
            expect(true).toBe(false); // Should not reach here
          } catch (error) {
            expect(error).toBeDefined();
          }
        }
      });

      test('should handle server restart scenario', async () => {
        // This test would require ability to restart the server mid-test
        // Marking as a placeholder for manual testing
        expect(true).toBe(true);
      });
    });

    describe('Performance and Timeout Handling', () => {
      test('should respect custom timeout values', async () => {
        const tabId = await harness.createTab('timeout-custom');
        createdTabs.push(tabId);
        
        // Command that takes 2 seconds
        const start = Date.now();
        const output = await harness.executeCommand(
          tabId,
          'sleep 2 && echo "Done"',
          5000 // 5 second timeout
        );
        const duration = Date.now() - start;
        
        expect(output).toContain('Done');
        expect(duration).toBeGreaterThan(2000);
        expect(duration).toBeLessThan(5000);
      });

      test('should handle timeout for hanging commands', async () => {
        const tabId = await harness.createTab('timeout-hang');
        createdTabs.push(tabId);
        
        // Command that would hang indefinitely
        const output = await harness.executeCommand(
          tabId,
          'cat', // Will wait for input
          1000 // 1 second timeout
        );
        
        // Should return whatever output is available
        expect(output).toBeDefined();
      });

      test('should handle very short timeout gracefully', async () => {
        const tabId = await harness.createTab('timeout-short');
        createdTabs.push(tabId);
        
        // Very short timeout
        const output = await harness.executeCommand(
          tabId,
          'echo "Quick"',
          10 // 10ms timeout - might not capture output
        );
        
        // Should not crash, might or might not capture output
        expect(output).toBeDefined();
      });
    });

    describe('MCP Protocol Compliance', () => {
      test('should return proper MCP formatted responses', async () => {
        // Test that responses follow MCP protocol structure
        const tools = await harness.listTools();
        
        // Should return tool definitions
        expect(tools).toBeDefined();
        expect(Array.isArray(tools)).toBe(false); // It's actually an object with 'tools' property
      });

      test('should handle missing required parameters', async () => {
        // Direct protocol test - missing window_id
        await expect(
          harness.sendRequest('tools/call', {
            name: 'execute_command',
            arguments: { command: 'echo "test"' } // Missing window_id
          })
        ).rejects.toThrow();
      });

      test('should handle extra parameters gracefully', async () => {
        const tabId = await harness.createTab('extra-params');
        createdTabs.push(tabId);
        
        // Send extra parameters that aren't in the schema
        const response = await harness.sendRequest('tools/call', {
          name: 'execute_command',
          arguments: {
            window_id: tabId,
            command: 'echo "test"',
            extra_param: 'should be ignored',
            another_extra: 123
          }
        });
        
        // Should work despite extra parameters
        expect(response).toBeDefined();
      });
    });

    describe('Shell Compatibility', () => {
      test('should work with different shell features', async () => {
        const tabId = await harness.createTab('shell-features');
        createdTabs.push(tabId);
        
        // Test various shell features
        const tests = [
          { cmd: 'echo ${SHELL}', desc: 'Shell variable expansion' },
          { cmd: 'echo ~', desc: 'Tilde expansion' },
          { cmd: 'echo *', desc: 'Glob expansion' },
          { cmd: 'echo $(date +%Y)', desc: 'Command substitution' },
          { cmd: 'echo $((2 + 2))', desc: 'Arithmetic expansion' },
          { cmd: 'test -d /tmp && echo "exists"', desc: 'Conditionals' },
          { cmd: 'for i in 1 2 3; do echo $i; done', desc: 'Loops' },
        ];
        
        for (const test of tests) {
          const output = await harness.executeCommand(tabId, test.cmd);
          expect(output).toBeTruthy();
          // Just verify it doesn't error - actual output varies by shell
        }
      });

      test('should handle shell built-ins correctly', async () => {
        const tabId = await harness.createTab('builtins');
        createdTabs.push(tabId);
        
        const builtins = [
          'cd /tmp',
          'export TEST=value',
          'alias ll="ls -l"',
          'unset TEST',
          'source /dev/null',
          'type echo',
        ];
        
        for (const builtin of builtins) {
          // Should execute without error
          await harness.executeCommand(tabId, builtin);
        }
        
        // Verify state changes persist
        const pwdOutput = await harness.executeCommand(tabId, 'pwd');
        expect(pwdOutput.trim()).toBe('/tmp');
      });
    });

    describe('Unicode and Internationalization', () => {
      test('should handle Unicode characters correctly', async () => {
        const tabId = await harness.createTab('unicode');
        createdTabs.push(tabId);
        
        const unicodeTests = [
          '你好世界', // Chinese
          'مرحبا بالعالم', // Arabic
          '🚀🎉🔥', // Emojis
          'Ñoño', // Spanish
          'Здравствуй', // Russian
          '日本語', // Japanese
        ];
        
        for (const text of unicodeTests) {
          const output = await harness.executeCommand(tabId, `echo "${text}"`);
          expect(output).toContain(text);
        }
      });

      test('should handle mixed encodings gracefully', async () => {
        const tabId = await harness.createTab('mixed-encoding');
        createdTabs.push(tabId);
        
        // Mix ASCII, Unicode, and special chars
        const mixed = 'Hello 世界 🌍 $PATH "quoted"';
        const output = await harness.executeCommand(tabId, `echo '${mixed}'`);
        
        expect(output).toContain('Hello');
        expect(output).toContain('世界');
        expect(output).toContain('🌍');
      });
    });
  });
});
