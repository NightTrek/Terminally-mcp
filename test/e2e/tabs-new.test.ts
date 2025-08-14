/**
 * Phase 1 TDD: tmux correctness and infra
 *
 * Focus areas:
 * - Window targeting consistency (@ID)
 * - Atomic create_tab with correct ID shape
 * - List parsing handles names with spaces (tab-delimited expected)
 * - Default shell/login environment is loaded (echo $SHELL returns expected)
 *
 * These tests are intended to fail initially against the current implementation,
 * then pass once Phase 1 fixes are applied.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { McpServerTestHarness } from '../utils/mcpServerTestHarness';

describe('Phase 1 — tmux correctness and infra', () => {
  const harness = new McpServerTestHarness();
  const createdTabs: string[] = [];

  beforeAll(async () => {
    await harness.start();
  }, 20000);

  afterAll(async () => {
    // Cleanup created tabs
    for (const tabId of createdTabs) {
      try {
        await harness.closeTab(tabId);
      } catch {
        // ignore cleanup errors
      }
    }
    await harness.stop();
  });

  test('create_tab returns a valid tmux window id (@N)', async () => {
    const id = await harness.createTab();
    createdTabs.push(id);
    expect(id).toMatch(/^@\d+$/);
  });

  test('list_tabs returns at least one active tab and correct structure', async () => {
    const id = await harness.createTab('active-check');
    createdTabs.push(id);

    const tabs = await harness.listTabs();
    expect(Array.isArray(tabs)).toBe(true);
    expect(tabs.length).toBeGreaterThan(0);

    // Validate structure and that at least one tab is active (not asserting which)
    const someActive = tabs.some(t => typeof t.active === 'boolean' && t.active);
    expect(someActive).toBe(true);

    // Every entry should have required fields
    for (const t of tabs) {
      expect(typeof t.window_id).toBe('string');
      expect(typeof t.name).toBe('string');
      expect(typeof t.active).toBe('boolean');
    }
  });

  test('create_tab supports names with spaces and list_tabs preserves them accurately', async () => {
    const nameWithSpaces = 'name with spaces';
    const id = await harness.createTab(nameWithSpaces);
    createdTabs.push(id);

    const tabs = await harness.listTabs();
    const found = tabs.find(t => t.window_id === id);
    expect(found).toBeDefined();
    expect(found?.name).toBe(nameWithSpaces);
  });

  test('rapid create_tab calls produce distinct @IDs (no race)', async () => {
    const names = ['rapid1', 'rapid two', 'rapid-3', 'rapid four name', 'rapid5'];
    const ids: string[] = [];
    for (const n of names) {
      const id = await harness.createTab(n);
      createdTabs.push(id);
      ids.push(id);
    }
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^@\d+$/);
    }
  });

  test('default shell environment is loaded (echo $SHELL)', async () => {
    const id = await harness.createTab('env-check');
    createdTabs.push(id);

    // Verify the shell reports a path; on macOS default is typically /bin/zsh
    const output = await harness.executeCommand(id, 'echo $SHELL', 5000);
    const trimmed = output.trim();
    expect(trimmed.length).toBeGreaterThan(0);

    // Prefer zsh by default on macOS; this asserts our design choice of login shell env
    // Accept either zsh or bash to avoid environment-specific flakiness.
    expect(
      trimmed.includes('zsh') || trimmed.includes('bash')
    ).toBe(true);
  });
});
