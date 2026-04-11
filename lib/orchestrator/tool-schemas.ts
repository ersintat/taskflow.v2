import { z } from 'zod';

// Zod schemas for orchestrator tools — works with both Claude and Gemini
export const TOOL_SCHEMAS = {
  create_task: {
    description: 'Create a new task in the current project.',
    parameters: z.object({
      title: z.string().describe('Task title'),
      description: z.string().optional().describe('Task description'),
      priority: z.enum(['urgent', 'high', 'medium', 'low']).optional().describe('Task priority'),
      platform: z.string().optional().describe('Platform tag'),
      taskType: z.string().optional().describe('Task type'),
    }),
  },
  update_task: {
    description: 'Update an existing task status, priority, or details.',
    parameters: z.object({
      taskId: z.string().describe('The task ID to update'),
      status: z.enum(['todo', 'in_progress', 'done', 'blocked', 'pending_review', 'cancelled']).optional().describe('New status'),
      priority: z.enum(['urgent', 'high', 'medium', 'low']).optional().describe('New priority'),
      title: z.string().optional().describe('Updated title'),
      description: z.string().optional().describe('Updated description'),
    }),
  },
  create_mission: {
    description: 'DEPRECATED — Do not use.',
    parameters: z.object({
      title: z.string().optional(),
    }),
  },
  update_context: {
    description: 'Save or update a key-value entry in the project context.',
    parameters: z.object({
      key: z.string().describe('Context key (e.g. "project-brief")'),
      value: z.string().describe('Context value (markdown supported)'),
    }),
  },
  add_knowledge: {
    description: 'Add a knowledge entry to the project knowledge base.',
    parameters: z.object({
      title: z.string().describe('Knowledge entry title'),
      content: z.string().describe('Knowledge content'),
      type: z.enum(['lesson_learned', 'decision_rationale', 'technical_note', 'process_note', 'reference', 'faq']).describe('Knowledge type'),
      tags: z.string().optional().describe('Comma-separated tags'),
    }),
  },
  create_sub_agent: {
    description: 'Create a new sub-agent with specific skills.',
    parameters: z.object({
      name: z.string().describe('Agent name'),
      capabilities: z.array(z.string()).describe('List of capabilities/skills'),
      trustLevel: z.enum(['full', 'supervised', 'restricted']).optional().describe('Trust level'),
      model: z.string().optional().describe('AI model for this agent'),
    }),
  },
  list_tasks: {
    description: 'Get the current list of tasks. ALWAYS call before creating tasks.',
    parameters: z.object({
      status: z.enum(['todo', 'in_progress', 'done', 'blocked', 'pending_review', 'all']).optional().describe('Filter by status'),
      platform: z.string().optional().describe('Filter by platform'),
    }),
  },
  list_missions: {
    description: 'DEPRECATED — Do not use.',
    parameters: z.object({
      status: z.string().optional(),
    }),
  },
  assign_task: {
    description: 'Assign an actor (human or sub-agent) to a task.',
    parameters: z.object({
      taskId: z.string().describe('The task ID to assign'),
      actorId: z.string().describe('The actor ID to assign'),
      role: z.enum(['ASSIGNEE', 'REVIEWER']).optional().describe('Assignment role'),
    }),
  },
  create_subtask: {
    description: 'Create a subtask/checklist item under a task.',
    parameters: z.object({
      taskId: z.string().describe('Parent task ID'),
      title: z.string().describe('Subtask title'),
    }),
  },
  add_comment: {
    description: 'Add a comment to a task.',
    parameters: z.object({
      taskId: z.string().describe('Task ID'),
      content: z.string().describe('Comment content'),
    }),
  },
  approve_reject_task: {
    description: 'Record a decision (approve, reject, redirect) on a task.',
    parameters: z.object({
      taskId: z.string().describe('Task ID'),
      decisionType: z.enum(['APPROVAL', 'REJECTION', 'REDIRECT']).describe('Decision type'),
      title: z.string().describe('Decision title'),
      decision: z.string().describe('Decision details'),
      rationale: z.string().optional().describe('Rationale'),
    }),
  },
  delete_task: {
    description: 'Delete a task. Only on explicit user request.',
    parameters: z.object({
      taskId: z.string().describe('Task ID to delete'),
    }),
  },
  enqueue_task: {
    description: 'Send a task to the agent queue for sub-agent processing. SYNCHRONOUS — waits for result.',
    parameters: z.object({
      taskId: z.string().describe('Task ID to enqueue'),
      priority: z.number().optional().describe('Priority (0=normal)'),
    }),
  },
  search_knowledge: {
    description: 'Search the knowledge base.',
    parameters: z.object({
      query: z.string().optional().describe('Search keyword'),
      type: z.enum(['lesson_learned', 'decision_rationale', 'technical_note', 'process_note', 'reference', 'faq', 'all']).optional().describe('Filter by type'),
    }),
  },
  send_notification: {
    description: 'Send a notification to the project owner.',
    parameters: z.object({
      title: z.string().describe('Notification title'),
      message: z.string().describe('Notification message'),
      type: z.enum(['info', 'success', 'warning', 'error']).optional().describe('Notification type'),
      link: z.string().optional().describe('Link URL'),
    }),
  },
  get_mission_result: {
    description: 'DEPRECATED — Do not use.',
    parameters: z.object({
      missionId: z.string().optional(),
    }),
  },
  list_agents: {
    description: 'List all actors with their capabilities.',
    parameters: z.object({
      type: z.enum(['HUMAN', 'AGENT', 'SYSTEM', 'all']).optional().describe('Filter by type'),
    }),
  },
  delete_knowledge: {
    description: 'Delete a knowledge base entry by ID.',
    parameters: z.object({
      knowledgeId: z.string().describe('The knowledge entry ID to delete'),
    }),
  },
} as const;
