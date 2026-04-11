import { tool } from 'ai';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@/lib/db';
import { TOOL_SCHEMAS } from './tool-schemas';
import { executeToolCall } from './executor';

const execPromise = promisify(exec);

export interface SubAgentContext {
  queueItemId: string;
  taskId: string;
  projectId: string;
  actorId: string;
  workspacePath: string;
}

// Tools that sub-agents are allowed to use
const ALLOWED_TOOLS = [
  'update_task',
  'create_subtask',
  'search_knowledge',
  'add_knowledge',
  'list_tasks',
  'update_context',
];

export function getSubAgentTools(ctx: SubAgentContext): Record<string, any> {
  const tools: Record<string, any> = {};

  // Filter tool schemas to allowed subset
  for (const [toolName, schema] of Object.entries(TOOL_SCHEMAS)) {
    if (!ALLOWED_TOOLS.includes(toolName)) continue;

    tools[toolName] = tool({
      description: schema.description,
      inputSchema: schema.parameters,
      execute: async (args: any) => {
        return executeToolCall(ctx.projectId, toolName, args);
      },
    });
  }

  // Custom add_comment — attributed to the sub-agent actor
  tools.add_comment = tool({
    description: 'Add a comment to a task, attributed to you.',
    inputSchema: z.object({
      taskId: z.string().describe('The task ID to comment on'),
      content: z.string().describe('Comment content'),
    }),
    execute: async ({ taskId, content }: { taskId: string; content: string }) => {
      try {
        const comment = await prisma.comment.create({
          data: { taskId, actorId: ctx.actorId, content },
        });
        return { success: true, data: { commentId: comment.id }, message: 'Comment added' };
      } catch (e: any) {
        return { success: false, data: null, message: `Failed to add comment: ${e.message}` };
      }
    },
  });

  // executeBash — scoped to workspace directory
  tools.executeBash = tool({
    description: 'Execute a bash command in the project workspace.',
    inputSchema: z.object({
      command: z.string().describe('The bash command to execute'),
    }),
    execute: async ({ command }: { command: string }) => {
      try {
        const { stdout, stderr } = await execPromise(command, {
          cwd: ctx.workspacePath,
          timeout: 30000,
        });
        if (stderr && !stdout) return `Warning: ${stderr}`;
        const output = stdout || stderr || '(no output)';
        return output.slice(0, 10000) + (output.length > 10000 ? '\n...[TRUNCATED]' : '');
      } catch (e: any) {
        return `Execution failed: ${e.message}`;
      }
    },
  });

  return tools;
}
