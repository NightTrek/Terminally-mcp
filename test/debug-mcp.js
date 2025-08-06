#!/usr/bin/env node

import { spawn } from 'child_process';
import { join } from 'path';

// Start the MCP server
const server = spawn('node', [join(process.cwd(), 'build', 'index.js')], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Handle server output
server.stdout.on('data', (data) => {
  console.log(`[Server stdout] ${data.toString()}`);
});

server.stderr.on('data', (data) => {
  console.log(`[Server stderr] ${data.toString()}`);
});

// Wait for the server to start
setTimeout(() => {
  // Try getting available tools using different method names
  console.log('Trying list_tools method...');
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: '1',
    method: 'list_tools',
    params: {}
  }) + '\n');
  
  // Wait a bit and try another method name
  setTimeout(() => {
    console.log('Trying listTools method...');
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: '2',
      method: 'listTools',
      params: {}
    }) + '\n');
    
    // Wait a bit and try another method name
    setTimeout(() => {
      console.log('Trying tools/list method...');
      server.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: '3',
        method: 'tools/list',
        params: {}
      }) + '\n');
      
      // Try tools/call
      setTimeout(() => {
        console.log('Trying tools/call method...');
        server.stdin.write(JSON.stringify({
          jsonrpc: '2.0',
          id: '4',
          method: 'tools/call',
          params: {
            name: 'create_tab',
            arguments: { name: 'test-tab' }
          }
        }) + '\n');
        
        // Wait a bit and try another format
        setTimeout(() => {
          console.log('Trying tools/create_tab method...');
          server.stdin.write(JSON.stringify({
            jsonrpc: '2.0',
            id: '5',
            method: 'tools/create_tab',
            params: { name: 'test-tab' }
          }) + '\n');
          
          // Wait a bit and try one more variation
          setTimeout(() => {
            console.log('Trying tools-call method...');
            server.stdin.write(JSON.stringify({
              jsonrpc: '2.0',
              id: '6',
              method: 'tools-call',
              params: {
                name: 'create_tab',
                arguments: { name: 'test-tab' }
              }
            }) + '\n');
            
            // After 2 seconds, kill the server
            setTimeout(() => {
              console.log('Killing server...');
              server.kill();
              process.exit(0);
            }, 2000);
          }, 1000);
        }, 1000);
      }, 1000);
    }, 1000);
  }, 1000);
}, 2000);
