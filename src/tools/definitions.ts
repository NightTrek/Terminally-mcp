/**
 * Tool definitions for the Terminally-mcp server
 * Defines the schema and metadata for each MCP tool
 */

// Create Tab Tool - Creates a new tmux window
export const createTabToolDefinition = {
  name: 'create_tab',
  description: 'Create a new terminal tab (tmux window)',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Optional name for the tab'
      },
      cwd: {
        type: 'string',
        description: 'Optional working directory for the shell'
      },
      env: {
        type: 'object',
        additionalProperties: {
          type: 'string'
        },
        description: 'Optional environment variables'
      },
      login: {
        type: 'boolean',
        description: 'Start shell as a login shell (e.g., zsh -l)'
      }
    },
    required: []
  },
  // Add schema alias for compatibility
  schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Optional name for the tab'
      },
      cwd: {
        type: 'string',
        description: 'Optional working directory for the shell'
      },
      env: {
        type: 'object',
        additionalProperties: {
          type: 'string'
        },
        description: 'Optional environment variables'
      },
      login: {
        type: 'boolean',
        description: 'Start shell as a login shell (e.g., zsh -l)'
      }
    },
    required: []
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

// Read Logs From Tab Tool - Reads recent logs from a tab's pipe-pane file
export const readLogsFromTabToolDefinition = {
  name: 'read_logs_from_tab',
  description: 'Read recent logs from a tab\'s pipe-pane file; line-count oriented',
  inputSchema: {
    type: 'object',
    properties: {
      window_id: {
        type: 'string'
      },
      lines: {
        type: 'number',
        description: 'Number of lines to return from the end (default 500)'
      },
      strip_ansi: {
        type: 'boolean',
        description: 'Remove ANSI sequences in returned content (default false)'
      }
    },
    required: ['window_id']
  }
};

// Execute Command Tool - Executes a command in a tmux window
export const executeCommandToolDefinition = {
  name: 'execute_command',
  description: 'Execute a command in a tab and return only the output produced between START/END markers',
  inputSchema: {
    type: 'object',
    properties: {
      window_id: {
        type: 'string'
      },
      command: {
        type: 'string'
      },
      timeout_ms: {
        type: 'number',
        description: 'Max wait for END marker; non-zero required for bounded exec (default 10000)'
      },
      strip_ansi: {
        type: 'boolean',
        description: 'Strip ANSI sequences (default false)'
      }
    },
    required: ['window_id', 'command']
  }
};

// Start Process Tool - Starts a long-running process
export const startProcessToolDefinition = {
  name: 'start_process',
  description: 'Start a long-running process; returns immediately; logs stream to pipe-pane file',
  inputSchema: {
    type: 'object',
    properties: {
      window_id: {
        type: 'string'
      },
      command: {
        type: 'string'
      },
      append_newline: {
        type: 'boolean',
        description: 'Append newline (Enter) after typing command (default true)'
      }
    },
    required: ['window_id', 'command']
  }
};

// Stop Process Tool - Gracefully stops foreground process
export const stopProcessToolDefinition = {
  name: 'stop_process',
  description: 'Gracefully stop foreground process in given tab. Can also be used to close a tab by killing its main process.',
  inputSchema: {
    type: 'object',
    properties: {
      window_id: {
        type: 'string'
      },
      signal: {
        type: 'string',
        description: 'One of SIGINT|SIGTERM; default SIGINT via C-c'
      }
    },
    required: ['window_id']
  }
};
