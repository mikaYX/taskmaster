import { Role } from '../enums/role.enum';
import { Permission } from './permissions.enum';

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  [Role.SUPER_ADMIN]: [
    Permission.TASK_READ,
    Permission.TASK_CREATE,
    Permission.TASK_UPDATE,
    Permission.TASK_DELETE,
    Permission.USER_READ,
    Permission.USER_WRITE,
    Permission.SETTINGS_READ,
    Permission.SETTINGS_WRITE,
    Permission.BACKUP_READ,
    Permission.BACKUP_WRITE,
    Permission.EXPORT_READ,
    Permission.SCHEDULE_READ,
    Permission.SCHEDULE_CREATE,
    Permission.SCHEDULE_UPDATE,
    Permission.SCHEDULE_DELETE,

    Permission.SITE_READ,
    Permission.SITE_WRITE,
    Permission.SITE_ASSIGN,
  ],
  [Role.MANAGER]: [
    Permission.TASK_READ,
    Permission.TASK_CREATE,
    Permission.TASK_UPDATE,
    Permission.USER_READ,
    Permission.USER_WRITE,
    Permission.EXPORT_READ,
    Permission.SCHEDULE_READ,
    Permission.SCHEDULE_CREATE,
    Permission.SCHEDULE_UPDATE,

    Permission.SITE_READ,
    Permission.SITE_ASSIGN,
  ],
  [Role.USER]: [
    Permission.TASK_READ,
    Permission.TASK_CREATE,
    Permission.TASK_UPDATE,
    Permission.USER_READ,
    Permission.EXPORT_READ,
    Permission.SCHEDULE_READ,

    Permission.SITE_READ,
  ],
  [Role.GUEST]: [
    Permission.TASK_READ,
    Permission.USER_READ,
    Permission.SITE_READ,
    Permission.EXPORT_READ,
    Permission.SCHEDULE_READ,
  ],
};
