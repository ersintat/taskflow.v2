// Orchestrator Tool Definitions — OpenAI-compatible function calling schema

export const ORCHESTRATOR_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'create_task',
      description: 'Create a new task in the current project. Use when the user asks to add a task or when you identify work that needs to be done.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Task description' },
          priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'], description: 'Task priority' },
          platform: { type: 'string', enum: ['gmc', 'google_ads', 'meta', 'ga4', 'gsc', 'klaviyo', 'shopify', ''], description: 'Platform tag (empty for no platform)' },
          taskType: { type: 'string', enum: ['feature', 'bug', 'improvement', 'research', 'maintenance'], description: 'Task type' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_task',
      description: 'Update an existing task status, priority, or details. Use task ID from the project context.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID to update' },
          status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked', 'pending_review', 'cancelled'], description: 'New status' },
          priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'], description: 'New priority' },
          title: { type: 'string', description: 'Updated title' },
          description: { type: 'string', description: 'Updated description' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_mission',
      description: 'DEPRECATED — Do not use. Use executeBash for file operations and script execution instead.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Mission title' },
          prompt: { type: 'string', description: 'Detailed prompt/instructions for Claude CLI to execute' },
          targetService: { type: 'string', enum: ['shopify', 'gmc', 'google_ads', 'meta', 'ga4', 'gsc', 'klaviyo', 'general'], description: 'Target service' },
          missionType: { type: 'string', enum: ['data_pull', 'analysis', 'action', 'report'], description: 'Type of mission' },
          priority: { type: 'number', description: 'Priority (0=normal, higher=more urgent)' },
        },
        required: ['title', 'prompt'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_context',
      description: 'Save or update a key-value entry in the project context. Use for storing important decisions, summaries, learnings.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Context key (e.g. "project-brief", "tech-stack", "agent-instructions")' },
          value: { type: 'string', description: 'Context value (markdown supported)' },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_knowledge',
      description: 'Add an entry to the project knowledge base. Use for documenting lessons learned, decisions, technical notes, processes.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Knowledge entry title' },
          content: { type: 'string', description: 'Knowledge content (markdown)' },
          type: { type: 'string', enum: ['lesson_learned', 'decision_rationale', 'technical_note', 'process_note', 'reference', 'faq'], description: 'Entry type' },
          tags: { type: 'string', description: 'Comma-separated tags' },
        },
        required: ['title', 'content', 'type'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_sub_agent',
      description: 'Create a new sub-agent (Actor) with specific skills for this project. Sub-agents can be assigned tasks.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Agent name (e.g. "Shopify Analyst", "GMC Monitor")' },
          capabilities: { type: 'array', items: { type: 'string' }, description: 'List of capabilities/skills' },
          trustLevel: { type: 'string', enum: ['full', 'supervised', 'restricted'], description: 'Trust level' },
          model: { type: 'string', description: 'AI model for this agent (default: gemini-2.0-flash). Options: gemini-2.0-flash, gemini-3.1-pro-preview' },
        },
        required: ['name', 'capabilities'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_tasks',
      description: 'Get the current list of tasks with their details. Use to check project status or find specific tasks.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked', 'pending_review', 'all'], description: 'Filter by status (default: all)' },
          platform: { type: 'string', description: 'Filter by platform tag' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_missions',
      description: 'DEPRECATED — Do not use.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'claimed', 'running', 'completed', 'failed', 'all'], description: 'Filter by status (default: all)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'assign_task',
      description: 'Assign an actor (human or sub-agent) to a task.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID to assign' },
          actorId: { type: 'string', description: 'The actor ID to assign' },
          role: { type: 'string', enum: ['ASSIGNEE', 'REVIEWER'], description: 'Assignment role (default: ASSIGNEE)' },
        },
        required: ['taskId', 'actorId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_subtask',
      description: 'Create a subtask (checklist item) under a task. Use to break work into smaller steps.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The parent task ID' },
          title: { type: 'string', description: 'Subtask title' },
        },
        required: ['taskId', 'title'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_comment',
      description: 'Add a comment to a task. Use for notes, updates, or instructions on a task.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID to comment on' },
          content: { type: 'string', description: 'Comment content' },
        },
        required: ['taskId', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'approve_reject_task',
      description: 'Approve or reject a task that is pending review. Also used for making project decisions.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID' },
          decisionType: { type: 'string', enum: ['APPROVAL', 'REJECTION', 'REDIRECT'], description: 'Decision type' },
          title: { type: 'string', description: 'Decision title' },
          decision: { type: 'string', description: 'Decision explanation' },
          rationale: { type: 'string', description: 'Rationale for the decision' },
        },
        required: ['taskId', 'decisionType', 'title', 'decision'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_task',
      description: 'Delete a task from the project. Use only when explicitly asked or when a task is clearly unnecessary.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID to delete' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'enqueue_task',
      description: 'Send a task to the Agent Queue for automated processing by a sub-agent.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID to enqueue' },
          priority: { type: 'number', description: 'Queue priority (0=normal, higher=more urgent)' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_knowledge',
      description: 'Search the project knowledge base for relevant information by keyword or type.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keyword' },
          type: { type: 'string', enum: ['lesson_learned', 'decision_rationale', 'technical_note', 'process_note', 'reference', 'faq', 'all'], description: 'Filter by type' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'send_notification',
      description: 'Send an in-app notification to the project owner. Use for important updates, alerts, or action items.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Notification title' },
          message: { type: 'string', description: 'Notification message' },
          type: { type: 'string', enum: ['info', 'success', 'warning', 'error'], description: 'Notification type' },
          link: { type: 'string', description: 'Optional link to navigate to when clicked' },
        },
        required: ['title', 'message'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_mission_result',
      description: 'DEPRECATED — Do not use.',
      parameters: {
        type: 'object',
        properties: {
          missionId: { type: 'string', description: 'The mission ID' },
        },
        required: ['missionId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_agents',
      description: 'List all actors (humans, agents, systems) with their capabilities. Use to find who to assign tasks to.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['HUMAN', 'AGENT', 'SYSTEM', 'all'], description: 'Filter by actor type (default: all)' },
        },
      },
    },
  },
];
