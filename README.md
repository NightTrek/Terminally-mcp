# Terminally-MCP

A Model Context Protocol (MCP) server for controlling terminal sessions via tmux. 

This MCP server enables AI systems to create and manage terminal sessions, execute commands, and read terminal output programmatically through a clean, well-defined interface.

## Features

- Create, close, and list terminal tabs (tmux windows)
- Execute commands in specific tabs
- Read terminal output, including scrollback history
- Managed tmux server instance that doesn't interfere with user's existing tmux sessions

## Prerequisites

- Node.js (v16+)
- tmux installed on the system

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/terminally-mcp.git
cd terminally-mcp

# Install dependencies
pnpm install

# Build the project
pnpm build
```

## Usage

### Starting the server

```bash
pnpm start
```

### Development

```bash
pnpm dev
```

### MCP Tools

This server provides the following MCP tools:

#### `create_tab`

Creates a new terminal tab.

**Arguments:**
- `name` (optional): Name for the new tab

**Returns:**
- `window_id`: ID of the created tab

#### `close_tab`

Closes a terminal tab.

**Arguments:**
- `window_id`: ID of the tab to close

**Returns:**
- `success`: Whether the tab was successfully closed

#### `list_tabs`

Lists all terminal tabs.

**Arguments:** None

**Returns:**
- `tabs`: Array of tab objects containing:
  - `window_id`: ID of the tab
  - `name`: Name of the tab
  - `active`: Whether this tab is active

#### `execute_command`

Executes a command in a terminal tab.

**Arguments:**
- `window_id`: ID of the tab to execute the command in
- `command`: Command to execute
- `timeout` (optional): Timeout in milliseconds before giving up (default: 10000)

**Returns:**
- `output`: Output from the command execution

#### `read_output`

Reads the contents of a terminal tab.

**Arguments:**
- `window_id`: ID of the tab to read
- `history_limit` (optional): Limit on how many lines of history to include

**Returns:**
- `content`: Content of the terminal tab

## Architecture

Terminally-MCP uses a modular architecture:

- `index.ts`: Entry point for the MCP server
- `server.ts`: Core server implementation
- `services/tmuxManager.ts`: Manages tmux server and interactions
- `tools/definitions.ts`: Defines MCP tool schemas
- `tools/handlers.ts`: Implements tool functionality

## Implementation Details

This server manages its own dedicated tmux server instance with a unique socket path, ensuring it doesn't interfere with any existing tmux sessions the user might be running.

Terminal tabs are implemented as tmux windows within a single managed session. Each window is assigned a unique ID that can be used to target it with commands or retrieve its output.

## License

ISC
