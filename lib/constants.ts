export const TASK_STATUSES = [
  { value: 'todo', label: 'To Do', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  { value: 'done', label: 'Done', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { value: 'blocked', label: 'Blocked', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  { value: 'pending_review', label: 'Pending Review', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { value: 'pending_acceptance', label: 'Pending Acceptance', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
] as const;

export const TASK_PRIORITIES = [
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500', dotColor: 'bg-red-500' },
  { value: 'high', label: 'High', color: 'bg-orange-500', dotColor: 'bg-orange-500' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500', dotColor: 'bg-yellow-500' },
  { value: 'low', label: 'Low', color: 'bg-gray-400', dotColor: 'bg-gray-400' },
] as const;

export const TASK_TYPES = [
  { value: 'action', label: 'Action' },
  { value: 'report', label: 'Report' },
  { value: 'audit', label: 'Audit' },
  { value: 'monitor', label: 'Monitor' },
] as const;

export const RISK_LEVELS = [
  { value: 'LOW', label: 'Low', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  { value: 'MEDIUM', label: 'Medium', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  { value: 'HIGH', label: 'High', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  { value: 'CRITICAL', label: 'Critical', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
] as const;

export const ACTOR_TYPES = [
  { value: 'HUMAN', label: 'Human' },
  { value: 'AGENT', label: 'AI Agent' },
  { value: 'SYSTEM', label: 'System' },
] as const;

export const TRUST_LEVELS = [
  { value: 'FULL', label: 'Full', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { value: 'SUPERVISED', label: 'Supervised', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { value: 'RESTRICTED', label: 'Restricted', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
] as const;

export const PLATFORMS = [
  { value: 'gmc', label: 'GMC', fullName: 'Google Merchant Center', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', dotColor: 'bg-red-500' },
  { value: 'google_ads', label: 'ADS', fullName: 'Google Ads', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300', dotColor: 'bg-yellow-500' },
  { value: 'meta', label: 'META', fullName: 'Meta Ads', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', dotColor: 'bg-blue-500' },
  { value: 'ga4', label: 'GA4', fullName: 'Google Analytics 4', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', dotColor: 'bg-orange-500' },
  { value: 'gsc', label: 'GSC', fullName: 'Google Search Console', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', dotColor: 'bg-violet-500' },
  { value: 'klaviyo', label: 'KLV', fullName: 'Klaviyo', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', dotColor: 'bg-emerald-500' },
  { value: 'shopify', label: 'SHPY', fullName: 'Shopify', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', dotColor: 'bg-green-500' },
] as const;

export const EVENT_TYPE_LABELS: Record<string, string> = {
  task_created: 'created a task',
  task_updated: 'updated a task',
  status_changed: 'changed status',
  priority_changed: 'changed priority',
  assigned: 'assigned',
  unassigned: 'unassigned',
  comment_added: 'commented',
  decision_made: 'made a decision',
  subtask_added: 'added a subtask',
  subtask_completed: 'completed a subtask',
  file_attached: 'attached a file',
  due_date_changed: 'changed due date',
  category_changed: 'changed category',
  blocked: 'blocked',
  unblocked: 'unblocked',
  queued: 'queued for agent',
  claimed: 'claimed',
  completed: 'completed',
};
