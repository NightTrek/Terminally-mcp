#!/usr/bin/env node

/**
 * A simplified MCP client test that directly interacts with our server
 * This will help us understand how clients connect to MCP servers
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { setTimeout as sleep } from 'timers/promises';

async function main() {
  console.log('Starting simplified MCP client test...');
  
  // Start the server process
  const server = spawn('node', [join(process.cwd(), 'build', 'index.js')], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Handle server output
  server.stdout.on('data', (data) => {
    console.log(`[Server stdout] ${data.toString().trim()}`);
  });
  
  server.stderr.on('data', (data) => {
    console.log(`[Server stderr] ${data.toString().trim()}`);
  });
  
  // Wait for server to start (give it a bit of time)
  await sleep(2000);
  
  try {
    // Register a response handler
    let responseReceived = false;
    
    const responseHandler = (data) => {
      const dataStr = data.toString().trim();
      
      if (!dataStr) return;
      
      console.log('Received raw server response:');
      console.log(dataStr);
      
      try {
        // Try to parse the response to make it readable
        const response = JSON.parse(dataStr);
        console.log('Parsed response:');
        console.log(JSON.stringify(response, null, 2));
        responseReceived = true;
      } catch (error) {
        console.log('Failed to parse response as JSON', error);
      }
    };
    
    // Add the temporary response handler
    server.stdout.on('data', responseHandler);
    
    // First, check the server capabilities
    console.log('\nSending server.capabilities request...');
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 'capabilities-1',
      method: 'server/capabilities',
      params: {}
    }) + '\n');
    
    // Wait a bit for response
    await sleep(1000);
    
    // Then, check the tools using tools/list which should work according to our earlier test
    console.log('\nSending tools/list request...');
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 'tools-1',
      method: 'tools/list',
      params: {}
    }) + '\n');
    
    // Wait for response
    await sleep(2000);
    
    // Wait for a bit longer to ensure we get responses
    await sleep(5000);
    
    // Cleanup
    console.log('Test completed, shutting down server...');
    server.kill();
    process.exit(0);
  } catch (error) {
    console.error('Error during test:', error);
    server.kill();
    process.exit(1);
  }
}

main().catch(console.error);
