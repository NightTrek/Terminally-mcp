/**
 * Tool definitions for the Terminally-mcp server
 * Defines the schema and metadata for each MCP tool
 */

// Create Tab Tool - Creates a new tmux window
export const createTabToolDefinition = {
  name: 'create_tab',
  description: 'Create a new terminal tab',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Optional name for the new tab'
      }
    },
    required: []
  }
};

// Close Tab Tool - Closes a tmux window
export const closeTabToolDefinition = {
  name: 'close_tab',
  description: 'Close a terminal tab',
  inputSchema: {
    type: 'object',
    properties: {
      window_id: {
        type: 'string',
        description: 'ID of the tab to close'
      }
    },
    required: ['window_id']
  }
};

// List Tabs Tool - Lists all tmux windows
export const listTabsToolDefinition = {
  name: 'list_tabs',
  description: 'List all terminal tabs',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  }
};

// Execute Command Tool - Executes a command in a tmux window
export const executeCommandToolDefinition = {
  name: 'execute_command',
  description: 'Execute a command in a terminal tab',
  inputSchema: {
    type: 'object',
    properties: {
      window_id: {
        type: 'string',
        description: 'ID of the tab to execute the command in'
      },
      command: {
        type: 'string',
        description: 'Command to execute'
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds before giving up (default: 10000)'
      }
    },
    required: ['window_id', 'command']
  }
};

// Read Output Tool - Reads the contents of a tmux window
export const readOutputToolDefinition = {
  name: 'read_output',
  description: 'Read the contents of a terminal tab',
  inputSchema: {
    type: 'object',
    properties: {
      window_id: {
        type: 'string',
        description: 'ID of the tab to read'
      },
      history_limit: {
        type: 'number',
        description: 'Optional limit on how many lines of history to include'
      }
    },
    required: ['window_id']
  }
};
