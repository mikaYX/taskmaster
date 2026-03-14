export enum Permission {
  // Tasks
  TASK_READ = 'task:read',
  TASK_CREATE = 'task:create',
  TASK_UPDATE = 'task:update',
  TASK_DELETE = 'task:delete',

  // Users
  USER_READ = 'user:read',
  USER_WRITE = 'user:write', // Create, Update, Delete

  // Settings
  SETTINGS_READ = 'settings:read',
  SETTINGS_WRITE = 'settings:write',

  // System
  BACKUP_READ = 'backup:read',
  BACKUP_WRITE = 'backup:write',
  EXPORT_READ = 'export:read',

  // Schedules
  SCHEDULE_READ = 'schedule:read',
  SCHEDULE_CREATE = 'schedule:create',
  SCHEDULE_UPDATE = 'schedule:update',
  SCHEDULE_DELETE = 'schedule:delete',



  // Sites
  SITE_READ = 'site:read',
  SITE_WRITE = 'site:write',
  SITE_ASSIGN = 'site:assign',

  // API Keys (Admin)
  API_KEYS_READ = 'api_keys:read',
  API_KEYS_WRITE = 'api_keys:write',
}
