#!/usr/bin/env node

/**
 * Entry point for the Terminally-mcp server
 * An MCP server that provides tools for controlling terminal sessions
 */
import { TerminallyServer } from './server.js';

// Initialize and run the server
const server = new TerminallyServer();
server.run().catch((error: Error) => {
    console.error('Failed to start Terminally-mcp server:', error);
    process.exit(1);
});
