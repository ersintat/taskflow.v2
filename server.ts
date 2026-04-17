import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import * as pty from 'node-pty';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { initScheduler } from './lib/scheduler';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new SocketIOServer(server, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    console.log('Client connected to terminal socket:', socket.id);
    let ptyProcess: pty.IPty | null = null;

    socket.on('terminal.init', ({ projectId }) => {
      if (!projectId) return;
      
      const shell = process.env.SHELL || '/bin/bash';
      
      // Define the workspace path isolated to this project
      const workspacePath = path.join(process.cwd(), 'workspaces', projectId);
      
      // Safely ensure directory exists AND register it globally with Claude
      if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
        
        try {
          const globalClaudeConfigPath = path.join(os.homedir(), '.claude.json');
          let globalConfig: any = {};
          
          if (fs.existsSync(globalClaudeConfigPath)) {
            const fileContent = fs.readFileSync(globalClaudeConfigPath, 'utf8');
            try { globalConfig = JSON.parse(fileContent); } catch(e) {}
          }
          
          // Inject workspace MCP mapping directly into global config
          globalConfig[workspacePath] = globalConfig[workspacePath] || {};
          globalConfig[workspacePath].allowedTools = ["Bash", "taskflow"];
          globalConfig[workspacePath].mcpServers = globalConfig[workspacePath].mcpServers || {};
          globalConfig[workspacePath].mcpServers['taskflow'] = {
            type: "stdio",
            command: "npx",
            args: ["tsx", path.join(process.cwd(), "mcp-server/index.ts")],
            env: {
              PROJECT_ID: projectId,
              DATABASE_URL: process.env.DATABASE_URL || "file:" + path.join(process.cwd(), "dev.db")
            }
          };
          
          fs.writeFileSync(globalClaudeConfigPath, JSON.stringify(globalConfig, null, 2));
          console.log(`Registered MCP server for ${projectId} in global ~/.claude.json`);
        } catch (e) {
          console.error("Failed to update global ~/.claude.json", e);
        }
      }

      // Start the terminal inside the isolated workspace using Tmux for persistence!
      const tmuxConfPath = path.join(process.cwd(), 'tmux.conf');
      ptyProcess = pty.spawn('tmux', ['-f', tmuxConfPath, 'new-session', '-A', '-s', `tf-${projectId}`], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: workspacePath,
        env: process.env as Record<string, string>
      });

      ptyProcess.onData((data) => {
        socket.emit('terminal.inc', data);
      });
    });

    socket.on('terminal.in', (data) => {
      if (ptyProcess) {
        ptyProcess.write(data);
      }
    });

    socket.on('terminal.resize', (size) => {
      try {
        if (ptyProcess && size && size.cols && size.rows) {
          ptyProcess.resize(size.cols, size.rows);
        }
      } catch (e) {
        console.error('Resize error:', e);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      try {
        if (ptyProcess) ptyProcess.kill();
      } catch (e) {}
    });
  });

  server.once('error', (err) => {
    console.error(err);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log('> WebSocket server is running for Terminal interface');
    initScheduler();

    // Cleanup uploaded images older than 24 hours — runs every hour
    const cleanupUploads = () => {
      try {
        const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
        if (!fs.existsSync(uploadsDir)) return;
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const files = fs.readdirSync(uploadsDir);
        let deleted = 0;
        for (const file of files) {
          const filePath = path.join(uploadsDir, file);
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
            deleted++;
          }
        }
        if (deleted > 0) console.log(`[uploads-cleanup] Deleted ${deleted} files older than 24h`);
      } catch (e: any) { console.error('[uploads-cleanup]', e.message); }
    };
    cleanupUploads(); // run on startup
    setInterval(cleanupUploads, 60 * 60 * 1000); // then every hour
  });
});
