/**
 * Shared API Types.
 *
 * Types that are used across multiple API modules.
 */

// Force module emission for isolatedModules/verbatimModuleSyntax
export const API_TYPES_VERSION = "1.0.0";

// ============================================
// Pagination
// ============================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

// ============================================
// User Types
// ============================================

export type UserRole = "SUPER_ADMIN" | "MANAGER" | "ADMIN" | "USER" | "GUEST";

export interface UserSite {
  siteId: number;
  siteName: string;
  siteCode: string;
  isDefault: boolean;
}

export interface User {
  id: number;
  username: string; // Will be the email
  fullname: string | null;
  avatarUrl?: string | null;
  email: string | null; // Redundant but consistent with backend
  role: UserRole;
  groupIds: number[];
  siteId?: number;
  sites?: Array<{
    siteId: number;
    isDefault: boolean;
    site?: { name: string; code: string };
  }>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateUserDto {
  username: string; // Email
  fullname?: string;
  email?: string;
  password: string;
  role: UserRole;
  siteId?: number;
}

export interface UpdateUserDto {
  username?: string;
  fullname?: string;
  email?: string;
  role?: UserRole;
}

// ============================================
// Group Types
// ============================================

export interface Group {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
  siteId: number;
  site?: { id: number; name: string; code: string };
  members?: Array<{ id: number; username: string; fullname?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGroupDto {
  name: string;
  description?: string;
  siteId?: number;
}

export interface UpdateGroupDto {
  name?: string;
  description?: string;
  siteId?: number;
}

export interface GroupMembersDto {
  userIds: number[];
}

// ============================================
// Task Types
// ============================================

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Task {
  id: number;
  name: string;
  description: string | null;
  scheduledTime: string; // HH:mm
  daysOfWeek: DayOfWeek[];
  timezone: string;
  assignedUserIds: number[];
  assignedGroupIds: number[];
  delegations?: {
    id: number;
    startAt: string;
    endAt: string;
    targetUsers: { id: number; username: string; fullname: string | null }[];
    targetGroups: { id: number; name: string }[];
    delegatedBy?: {
      id: number;
      username: string;
      fullname: string | null;
    } | null;
  }[];

  procedureUrl: string | null;
  priority: TaskPriority;

  // New Fields
  periodicity: string;
  startDate: string;
  endDate: string | null;
  skipWeekends: boolean;
  skipHolidays: boolean;

  rrule: string | null;
  recurrenceMode: "ON_SCHEDULE" | "FROM_COMPLETION" | null;
  dueOffset: number | null;

  useGlobalWindowDefaults: boolean;
  windowStartTime: string | null;
  windowEndTime: string | null;

  isActive: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: number | null;
}

export interface CreateTaskDto {
  name: string;
  description: string;
  periodicity: string;
  priority?: TaskPriority;

  startDate: string;
  endDate?: string;
  procedureUrl?: string;

  skipWeekends?: boolean;
  skipHolidays?: boolean;

  // Assignments
  userIds?: number[];
  groupIds?: number[];

  rrule?: string;
  timezone?: string;
  dueOffset?: number;
  recurrenceMode?: "ON_SCHEDULE" | "FROM_COMPLETION";

  useGlobalWindowDefaults?: boolean;
  windowStartTime?: string | null;
  windowEndTime?: string | null;
}

export interface UpdateTaskDto {
  name?: string;
  description?: string;
  scheduledTime?: string;
  daysOfWeek?: DayOfWeek[];
  timezone?: string;
  priority?: TaskPriority;

  // V2 & Full Edit Support
  periodicity?: string;
  startDate?: string;
  endDate?: string | null;
  procedureUrl?: string;
  skipWeekends?: boolean;
  skipHolidays?: boolean;

  rrule?: string;
  recurrenceMode?: "ON_SCHEDULE" | "FROM_COMPLETION";
  dueOffset?: number;

  useGlobalWindowDefaults?: boolean;
  windowStartTime?: string | null;
  windowEndTime?: string | null;

  userIds?: number[];
  groupIds?: number[];
}

export interface TaskAssignmentDto {
  ids: number[];
}

export interface OverrideOccurrenceDto {
  originalDate: string;
  action: "MOVE" | "SKIP";
  targetDate?: string;
  reason?: string;
}

// ============================================
// Delegation Types
// ============================================

export interface Delegation {
  id: number;
  taskId: number;
  delegatedById?: number;
  startAt: string;
  endAt: string;
  reason: string | null;
  targetUsers: {
    userId: number;
    user: { fullname: string | null; username: string };
  }[];
  targetGroups: { groupId: number; group: { name: string } }[];
  createdAt: string;
}

export interface CreateDelegationDto {
  startAt: string;
  endAt: string;
  reason?: string;
  targetUserIds?: number[];
  targetGroupIds?: number[];
}

export interface UpdateDelegationDto {
  startAt?: string;
  endAt?: string;
  reason?: string;
  targetUserIds?: number[];
  targetGroupIds?: number[];
}

// ============================================
// Status Types
// ============================================

export type TaskStatusValue = "SUCCESS" | "FAILED" | "MISSING" | "RUNNING";

export interface BoardItem {
  taskId: number;
  taskName: string;
  description?: string;
  periodicity: string;
  procedureUrl?: string;
  priority?: TaskPriority;

  instanceDate: string;
  originalDate: string;
  periodStart: string;
  periodEnd: string;
  isShifted: boolean;
  isException?: boolean;
  originalInstanceDate?: string;

  status: TaskStatusValue;
  validation?: {
    byUserId: number;
    byUsername: string;
    validatedAt: string;
    comment?: string;
  };

  assignedUsers: { id: number; name: string }[];
  assignedGroups: { id: number; name: string }[];
}

export interface TaskStatus {
  id: number;
  taskId: number;
  date: string;
  status: TaskStatusValue;
  validatedBy: number | null;
  validatedAt: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SetStatusDto {
  taskId: number;
  date: string;
  status: TaskStatusValue;
  comment?: string;
}

export interface StatusCounts {
  success: number;
  running: number;
  failed: number;
  missing: number;
  total: number;
}

// ============================================
// Settings Types
// ============================================

export interface Setting {
  key: string;
  value: unknown;
  description: string;
}

export interface SetSettingDto {
  key: string;
  value: unknown;
}

// ============================================
// Auth Types
// ============================================

export interface LoginDto {
  username: string;
  password: string;
}

export interface AuthSessionResponse {
  expiresIn: number;
  mustChangePassword?: boolean;
}

export type LoginResponse =
  | AuthSessionResponse
  | { requiresMfa: true; mfaToken: string };

export interface VerifyMfaLoginDto {
  mfaToken: string;
  token: string;
}

export interface MfaSetupResponse {
  secret: string;
  uri: string;
  qrCodeUrl: string;
}

export interface MfaEnableResponse {
  message: string;
  recoveryCodes: string[];
}

export interface Passkey {
  id: string;
  name: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface Session {
  valid: boolean;
  // Hybrid support: Flat fields (Deprecated)
  id?: number;
  username?: string;
  fullname?: string | null;
  role?: string;
  groups?: number[]; // Strict contract for use-auth.ts
  groupIds?: number[]; // Added for S3.1

  // New nested structure
  user?: {
    id: number;
    username: string;
    fullname: string | null;
    role: string;
    permissions: string[];
    groupIds?: number[];
    sites?: UserSite[];
    passkeysEnabled: boolean;
    passkeyPolicy: 'disabled' | 'optional' | 'required';
    hasPasskey: boolean;
  };
}

export interface ChangePasswordDto {
  password: string;
}

// ============================================
// Export Types
// ============================================

export type ExportFormat = "csv" | "pdf";

export interface GenerateExportDto {
  format: ExportFormat;
  startDate: string;
  endDate: string;
}

export interface ExportFile {
  filename: string;
  size: number;
  createdAt: string;
}

// ============================================
// Backup Types
// ============================================

export interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
}

// ============================================
// Scheduler Types
// ============================================

export interface SchedulerJob {
  name: string;
  cron: string;
  enabled: boolean;
}

export interface TriggerJobResult {
  success: boolean;
  message: string;
}

// ============================================
// Audit Types
// ============================================

export interface AuditLog {
  id: number;
  timestamp: string;
  actorId: number | null;
  actorName: string | null;
  action: string;
  target: string | null;
  category: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  details: string | null; // JSON string
  ipAddress: string | null;
  actor?: {
    username: string | null;
    fullname: string | null;
  };
}

export interface AuditLogParams {
  skip?: number;
  take?: number;
  category?: string;
  actorId?: number;
  from?: string; // ISO Date
  to?: string; // ISO Date
}

// ============================================
// API Keys Types
// ============================================

export interface ApiKey {
  id: number;
  name: string | null;
  description: string | null;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface CreateApiKeyResponse {
  apiKey: string;
  id: number;
  prefix: string;
}

// ============================================
// Todo Types
// ============================================

export type TodoScope = 'PRIVATE' | 'COLLECTIVE';

export interface Todo {
  id: number;
  title: string;
  isCompleted: boolean;
  completedAt: string | null;
  dueDate: string | null;
  scope: TodoScope;
  groupId: number | null;
  userId: number;
  createdAt: string;
}

export interface CreateTodoDto {
  title: string;
  dueDate?: string;
  scope?: TodoScope;
  groupId?: number;
}

export interface UpdateTodoDto {
  title?: string;
  dueDate?: string | null;
  isCompleted?: boolean;
  groupId?: number;
}

// ============================================
// Analytics Types
// ============================================

export interface AnalyticsDateParams {
  startDate: string;
  endDate: string;
}

export interface AnalyticsOverview {
  success: number;
  failed: number;
  running: number;
  missing: number;
  total: number;
  complianceRate: number;
}

export interface AnalyticsTrendPoint {
  date: string;
  success: number;
  failed: number;
  missing: number;
}

export interface AnalyticsByTask {
  taskId: number;
  taskName: string;
  total: number;
  success: number;
  failed: number;
  missing: number;
  complianceRate: number;
}

export interface AnalyticsByUser {
  userId: number;
  username: string;
  fullname: string | null;
  total: number;
  success: number;
  failed: number;
  complianceRate: number;
}
