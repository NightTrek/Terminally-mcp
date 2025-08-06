/**
 * Tool definitions for the Terminally-mcp server
 * Defines the schema and metadata for each MCP tool
 */

// Create Tab Tool - Creates a new tmux window
export const createTabToolDefinition = {
  name: 'create_tab',
  description: 'Create a new terminal tab',
  schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Optional name for the new tab'
      }
    },
    required: []
  },
  returns: {
    type: 'object',
    properties: {
      window_id: {
        type: 'string',
        description: 'The ID of the created tab'
      }
    },
    required: ['window_id']
  }
};

// Close Tab Tool - Closes a tmux window
export const closeTabToolDefinition = {
  name: 'close_tab',
  description: 'Close a terminal tab',
  schema: {
    type: 'object',
    properties: {
      window_id: {
        type: 'string',
        description: 'ID of the tab to close'
      }
    },
    required: ['window_id']
  },
  returns: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the tab was successfully closed'
      }
    },
    required: ['success']
  }
};

// List Tabs Tool - Lists all tmux windows
export const listTabsToolDefinition = {
  name: 'list_tabs',
  description: 'List all terminal tabs',
  schema: {
    type: 'object',
    properties: {},
    required: []
  },
  returns: {
    type: 'object',
    properties: {
      tabs: {
        type: 'array',
        description: 'List of all terminal tabs',
        items: {
          type: 'object',
          properties: {
            window_id: {
              type: 'string',
              description: 'ID of the tab'
            },
            name: {
              type: 'string',
              description: 'Name of the tab'
            },
            active: {
              type: 'boolean',
              description: 'Whether this tab is active'
            }
          },
          required: ['window_id', 'name', 'active']
        }
      }
    },
    required: ['tabs']
  }
};

// Execute Command Tool - Executes a command in a tmux window
export const executeCommandToolDefinition = {
  name: 'execute_command',
  description: 'Execute a command in a terminal tab',
  schema: {
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
  },
  returns: {
    type: 'object',
    properties: {
      output: {
        type: 'string',
        description: 'Output from the command execution'
      }
    },
    required: ['output']
  }
};

// Read Output Tool - Reads the contents of a tmux window
export const readOutputToolDefinition = {
  name: 'read_output',
  description: 'Read the contents of a terminal tab',
  schema: {
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
  },
  returns: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Content of the terminal tab'
      }
    },
    required: ['content']
  }
};
