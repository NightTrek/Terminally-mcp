<div align="center">

# 🖥️ Terminally MCP

### **Supercharge AI Assistants with Terminal Control Powers** ⚡

[![MCP Protocol](https://img.shields.io/badge/MCP-1.0-blue.svg)](https://modelcontextprotocol.io)
[![Node.js](https://img.shields.io/badge/Node.js-16%2B-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](https://opensource.org/licenses/ISC)

*Give your AI assistant the power to create, manage, and control terminal sessions like a pro developer! Built on the Model Context Protocol (MCP) for seamless integration with AI tools like Claude, ChatGPT, and more.*

[Features](#-features) • [Quick Start](#-quick-start) • [Installation](#-installation) • [API Reference](#-api-reference) • [Examples](#-examples)

</div>

---

## 🎯 What is Terminally MCP?

Terminally MCP is a **Model Context Protocol (MCP) server** that bridges the gap between AI assistants and terminal operations. It provides a safe, controlled environment where AI can:

- 🚀 **Execute shell commands** with full output capture
- 📂 **Manage multiple terminal sessions** simultaneously  
- 🔍 **Read terminal history** and scrollback buffers
- 🛡️ **Isolated tmux environment** that won't interfere with your existing sessions
- ⚡ **Real-time command execution** with timeout protection

Perfect for AI-powered development workflows, automation, system administration, and interactive coding assistance!

## ✨ Features

<table>
<tr>
<td width="50%">

### 🎮 Terminal Control
- Create and manage multiple terminal tabs
- Execute commands with proper quote/escape handling
- Capture command output and exit codes
- Read terminal history and scrollback

</td>
<td width="50%">

### 🔒 Safe & Isolated
- Dedicated tmux server instance
- No interference with user's tmux sessions
- Timeout protection for long-running commands
- Clean session management

</td>
</tr>
<tr>
<td width="50%">

### 🤖 AI-Optimized
- MCP protocol compliance
- Structured JSON responses
- Error handling and recovery
- Marker-based output capture

</td>
<td width="50%">

### 🛠️ Developer Friendly
- TypeScript with full type safety
- Comprehensive test suite
- Clean, modular architecture
- Easy to extend and customize

</td>
</tr>
</table>

## 🚀 Quick Start

Get up and running in under 2 minutes!

```bash
# Clone the repository
git clone https://github.com/yourusername/terminally-mcp.git
cd terminally-mcp

# Install dependencies (we recommend pnpm for speed!)
pnpm install

# Build the TypeScript code
pnpm build

# Start the MCP server
pnpm start
```

That's it! The server is now ready to accept MCP connections.

## 📦 Installation

### Prerequisites

- **Node.js** v16 or higher
- **tmux** installed on your system
- **pnpm** (recommended) or npm/yarn

### Install tmux

<details>
<summary>🍎 macOS</summary>

```bash
brew install tmux
```
</details>

<details>
<summary>🐧 Linux</summary>

```bash
# Ubuntu/Debian
sudo apt-get install tmux

# Fedora
sudo dnf install tmux

# Arch
sudo pacman -S tmux
```
</details>

### Setup for AI Assistants

<details>
<summary>🤖 Claude Desktop (via MCP)</summary>

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "terminally-mcp": {
      "command": "node",
      "args": ["/path/to/terminally-mcp/build/index.js"]
    }
  }
}
```
</details>

<details>
<summary>⚡ Cline/Other MCP Clients</summary>

Add to your MCP client configuration:

```json
{
  "terminally-mcp": {
    "command": "node",
    "args": ["/path/to/terminally-mcp/build/index.js"],
    "type": "stdio"
  }
}
```
</details>

## 📖 API Reference

### 🔧 Available Tools

#### `create_tab`
Creates a new terminal session.

```typescript
// Request
{
  "name": "my-session"  // Optional: custom name for the tab
}

// Response
{
  "window_id": "@1"  // Unique identifier for the created tab
}
```

#### `execute_command`
Run any shell command in a specific terminal tab.

```typescript
// Request
{
  "window_id": "@1",
  "command": "echo 'Hello, World!' && ls -la",
  "timeout": 5000  // Optional: timeout in ms (default: 10000)
}

// Response
{
  "output": "Hello, World!\ntotal 64\ndrwxr-xr-x  10 user  staff  320 Jan 15 10:00 ."
}
```

#### `list_tabs`
Get all active terminal sessions.

```typescript
// Response
{
  "tabs": [
    {
      "window_id": "@0",
      "name": "default",
      "active": true
    },
    {
      "window_id": "@1",
      "name": "my-session",
      "active": false
    }
  ]
}
```

#### `read_output`
Read the terminal buffer including history.

```typescript
// Request
{
  "window_id": "@1",
  "history_limit": 100  // Optional: number of history lines
}

// Response
{
  "content": "$ echo 'Previous command'\nPrevious command\n$ ls\nfile1.txt file2.txt"
}
```

#### `close_tab`
Close a terminal session.

```typescript
// Request
{
  "window_id": "@1"
}

// Response
{
  "success": true
}
```

## 💡 Examples

### Basic Command Execution
```javascript
// Create a new terminal
const tab = await mcp.call('create_tab', { name: 'dev-server' });

// Navigate and start a development server
await mcp.call('execute_command', {
  window_id: tab.window_id,
  command: 'cd /my/project && npm run dev'
});

// Check the output
const output = await mcp.call('read_output', {
  window_id: tab.window_id
});
```

### Multi-Tab Workflow
```javascript
// Create tabs for different purposes
const webTab = await mcp.call('create_tab', { name: 'web-server' });
const dbTab = await mcp.call('create_tab', { name: 'database' });
const testTab = await mcp.call('create_tab', { name: 'tests' });

// Start services in parallel
await Promise.all([
  mcp.call('execute_command', {
    window_id: webTab.window_id,
    command: 'npm run dev'
  }),
  mcp.call('execute_command', {
    window_id: dbTab.window_id,
    command: 'docker-compose up postgres'
  })
]);

// Run tests
await mcp.call('execute_command', {
  window_id: testTab.window_id,
  command: 'npm test'
});
```

### Complex Command Chains
```javascript
// Execute multiple commands with proper escaping
await mcp.call('execute_command', {
  window_id: '@1',
  command: `
    echo "Setting up environment..." &&
    export NODE_ENV=development &&
    echo "Installing dependencies..." &&
    npm install &&
    echo "Running migrations..." &&
    npm run migrate &&
    echo "Starting application..." &&
    npm start
  `.trim()
});
```

## 🏗️ Architecture

```
terminally-mcp/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # MCP server implementation
│   ├── services/
│   │   └── tmuxManager.ts    # tmux interaction layer
│   └── tools/
│       ├── definitions.ts    # Tool schemas
│       └── handlers.ts       # Tool implementations
├── test/                     # Test suite
├── build/                    # Compiled JavaScript
└── package.json
```

### Key Design Decisions

- **🔐 Isolated tmux Server**: Each instance uses a unique socket path to prevent conflicts
- **📍 Marker-Based Output Capture**: Reliable command output extraction using UUID markers
- **⏱️ Timeout Protection**: Configurable timeouts prevent hanging on long-running commands
- **🎯 Type Safety**: Full TypeScript implementation with strict typing

## 🧪 Development

```bash
# Run in development mode (auto-rebuild)
pnpm dev

# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Build for production
pnpm build

# Start production server
pnpm start
```

## 🤝 Contributing

We love contributions! Whether it's:

- 🐛 Bug reports
- 💡 Feature requests
- 📖 Documentation improvements
- 🔧 Code contributions

Please feel free to:
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on the [Model Context Protocol](https://modelcontextprotocol.io) specification
- Powered by [tmux](https://github.com/tmux/tmux) - the terminal multiplexer
- Inspired by the need for better AI-terminal integration

## 🌟 Star History

If you find this project useful, please consider giving it a ⭐ on GitHub!

---

<div align="center">

**Built with ❤️ for the AI-assisted development community**

[Report Bug](https://github.com/yourusername/terminally-mcp/issues) • [Request Feature](https://github.com/yourusername/terminally-mcp/issues) • [Join Discussion](https://github.com/yourusername/terminally-mcp/discussions)

</div>
