import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/db';

interface ActorInfo {
  id: string;
  name: string;
  type: string;
  trustLevel: string;
  persona?: string | null;
  behavior?: string | null;
  rules?: string | null;
  capabilities: { capabilityName: string; proficiencyLevel: number }[];
}

interface TaskInfo {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  taskType: string;
  platform: string | null;
  projectId: string;
}

export async function buildSubAgentPrompt(
  actor: ActorInfo,
  task: TaskInfo,
  projectId: string,
  workspacePath: string
): Promise<string> {
  // Load task details (subtasks, comments, related activities)
  const [subtasks, comments, contexts, knowledge] = await Promise.all([
    prisma.subtask.findMany({
      where: { taskId: task.id },
      orderBy: { order: 'asc' },
      select: { title: true, completed: true },
    }),
    prisma.comment.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { content: true, createdAt: true },
    }),
    prisma.projectContext.findMany({
      where: { projectId },
      select: { key: true, value: true, version: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.knowledgeBase.findMany({
      where: { projectId },
      select: { title: true, content: true, type: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  // De-duplicate contexts (latest version per key)
  const latestContexts = new Map<string, { key: string; value: string; version: number }>();
  for (const c of contexts) {
    if (!latestContexts.has(c.key)) latestContexts.set(c.key, c);
  }

  // --- Build prompt sections ---

  const capabilities = actor.capabilities.map(c => c.capabilityName).join(', ');

  const personaBlock = actor.persona ? `\n\n## ROLE / PERSONA\n${actor.persona}` : '';
  const behaviorBlock = actor.behavior ? `\n\n## BEHAVIOR\n${actor.behavior}` : '';
  const rulesBlock = actor.rules ? `\n\n## RULES & CONSTRAINTS\n${actor.rules}` : '';

  const identity = `You are **${actor.name}**, a specialized sub-agent in the Taskflow V2 system.

Your capabilities: ${capabilities || 'general'}
Trust level: ${actor.trustLevel}

You are an EXECUTOR — not a planner. Your job is to COMPLETE the assigned task using your tools, then provide a clear summary of what you accomplished. Do not ask for permission or suggest alternatives — just do the work.

Respond in the same language as the task description.${personaBlock}${behaviorBlock}${rulesBlock}`;

  const taskSection = `## YOUR ASSIGNED TASK

**Title:** ${task.title}
**Priority:** ${task.priority}
**Type:** ${task.taskType}
${task.platform ? `**Platform:** ${task.platform}` : ''}
**Description:** ${task.description || 'No description provided.'}

${subtasks.length > 0 ? `### Subtasks\n${subtasks.map(s => `- [${s.completed ? 'x' : ' '}] ${s.title}`).join('\n')}` : ''}

${comments.length > 0 ? `### Previous Comments\n${comments.map(c => `- ${c.content.substring(0, 200)}`).join('\n')}` : ''}`;

  const contextSection = latestContexts.size > 0
    ? `## PROJECT CONTEXT\n${Array.from(latestContexts.values()).map(c => `**${c.key}:** ${c.value.substring(0, 300)}`).join('\n\n')}`
    : '';

  const knowledgeSection = knowledge.length > 0
    ? `## RELEVANT KNOWLEDGE\n${knowledge.map(k => `- [${k.type}] ${k.title}: ${k.content.substring(0, 200)}`).join('\n')}`
    : '';

  // Check for governance docs
  let governanceSection = '';
  const governancePath = path.join(workspacePath, 'governance');
  try {
    if (fs.existsSync(governancePath)) {
      governanceSection = `## GOVERNANCE
This workspace has governance rules in the governance/ directory. Read them with executeBash if your task involves risk assessment or compliance.`;
    }
  } catch (e: any) { console.error('[sub-agent-prompt] governance check:', e.message); }

  const toolGuidance = `## TOOL USAGE

You have access to these tools:
- \`executeBash\`: Read files, list directories, run scripts in the workspace
- \`add_comment\`: Report progress on your task (attributed to you)
- \`update_task\`: Update task status or description
- \`create_subtask\`: Break your work into tracked sub-items
- \`search_knowledge\`: Find relevant past decisions and lessons
- \`add_knowledge\`: Save important findings or lessons learned
- \`list_tasks\`: See other tasks for context
- \`update_context\`: Save project state information

You do NOT have access to: create_task, create_sub_agent, enqueue_task, delete_task, approve_reject_task, assign_task, send_notification.`;

  const completionProtocol = `## COMPLETION PROTOCOL

When you finish your work:
1. Add a comment to the task summarizing what you did (use add_comment)
2. If you learned something important, save it (use add_knowledge)
3. Your final message should be a concise summary of accomplishments

Be specific: mention file names, data points, actions taken. Not "I analyzed the data" but "I analyzed listings_all.tsv — found 29 suppressed listings due to missing main images."`;

  const sections = [
    identity,
    taskSection,
    contextSection,
    knowledgeSection,
    governanceSection,
    toolGuidance,
    completionProtocol,
  ].filter(Boolean);

  return sections.join('\n\n');
}
