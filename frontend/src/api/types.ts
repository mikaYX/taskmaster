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
  /** TV (GUEST) accounts only: the screen the link opens. */
  guestView?: GuestViewName | null;
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
  sendEmail?: boolean;
}

/** Outcome of emailing the temporary credentials (only set when requested). */
export type CredentialsEmailStatus = 'SENT' | 'FAILED' | 'NOT_ACTIVE' | 'NO_ADDRESS';

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
  executionChecklist?: ChecklistStep[];
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

export interface ChecklistStep {
  id: string;
  label: string;
  kind: 'CHECK' | 'TEXT' | 'NUMBER' | 'PHOTO';
  required: boolean;
}
export interface ExecutionAnswer { id: string; value: string | number | boolean }
export interface ExecutionAnswerSnapshot extends ChecklistStep { value: string | number | boolean }
export interface ExecutionSubmission {
  executionAnswers?: ExecutionAnswer[];
  correctiveAction?: { title: string; dueDate?: string; assigneeId?: number; assigneeGroupId?: number };
}
export interface StatusUpdateInput extends ExecutionSubmission {
  taskId: number; date: string; status: TaskStatusValue; comment?: string;
}
export interface CorrectiveAction {
  id: number; taskId: number; instanceDate: string; title: string;
  /** One person or one team, never both. */
  assigneeId: number | null; assigneeGroupId: number | null; createdById: number; dueDate: string | null;
  state: 'OPEN' | 'CLOSED'; resolution: string | null; closedAt: string | null;
  task: { name: string; siteId: number };
  assignee: { id: number; username: string; fullname: string | null } | null;
  assigneeGroup: { id: number; name: string } | null;
  /** Decided by the server: a manager, the assignee or a member of the assigned team. */
  canUpdate: boolean;
}

export interface ExecutionAssignees {
  users: { id: number; username: string; fullname: string | null }[];
  groups: { id: number; name: string; memberCount: number }[];
}

export interface CreateTaskDto {
  name: string;
  description: string;
  periodicity: string;
  priority?: TaskPriority;

  startDate: string;
  endDate?: string;
  procedureUrl?: string;
  executionChecklist?: ChecklistStep[];

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
  executionChecklist?: ChecklistStep[];
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

export interface CreateBulkDelegationDto extends CreateDelegationDto {
  taskIds: number[];
}

export interface BulkDelegationResult {
  created: { taskId: number; delegationId: number }[];
  failed: { taskId: number; taskName: string | null; reason: string }[];
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
  executionRecord?: ExecutionAnswerSnapshot[];
  taskId: number;
  taskName: string;
  description?: string;
  periodicity: string;
  procedureUrl?: string;
  executionChecklist?: ChecklistStep[];
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

/** What a TV (GUEST) link opens: the task board, or the analytics. */
export type GuestViewName = 'DASHBOARD' | 'ANALYTICS';

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
  role?: UserRole;
  groups?: number[]; // Strict contract for use-auth.ts
  groupIds?: number[]; // Added for S3.1
  permissions?: string[];
  sites?: UserSite[];
  passkeysEnabled?: boolean;
  passkeyPolicy?: 'disabled' | 'optional' | 'required';
  hasPasskey?: boolean;
  mustChangePassword?: boolean;
  guestView?: GuestViewName | null;

  // New nested structure
  user?: {
    id: number;
    username: string;
    fullname: string | null;
    role: UserRole;
    permissions: string[];
    groupIds?: number[];
    groups?: number[];
    sites?: UserSite[];
    passkeysEnabled: boolean;
    passkeyPolicy: 'disabled' | 'optional' | 'required';
    hasPasskey: boolean;
    mustChangePassword?: boolean;
    guestView?: GuestViewName | null;
  };
}

export interface ChangePasswordDto {
  currentPassword: string;
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
export type TodoPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface Todo {
  id: number;
  title: string;
  isCompleted: boolean;
  completedAt: string | null;
  dueDate: string | null;
  scope: TodoScope;
  priority: TodoPriority;
  description: string | null;
  /** Time of day of the due date (HH:mm, application timezone); null = 09:00. */
  dueTime: string | null;
  /** Minutes before the due moment to remind; null = the default (one day). */
  remindBeforeMinutes: number | null;
  /** Manual order inside a priority. */
  position: number;
  /** Set on a subtask: the id of its parent (one level only). */
  parentId: number | null;
  completedBy: TodoPerson | null;
  /** Who is in charge (collective todos). */
  assigneeId: number | null;
  assignee: TodoPerson | null;
  _count?: { comments: number; attachments: number };
  groupId: number | null;
  userId: number;
  createdAt: string;
}

export interface TodoPerson {
  id: number;
  username: string;
  fullname: string | null;
}

export interface TodoComment {
  id: number;
  todoId: number;
  userId: number;
  body: string;
  createdAt: string;
  user: TodoPerson;
}

export interface TodoAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploader: TodoPerson;
}

/** What needs attention now, for the badges and the opening reminder. */
export interface TodoSummary {
  overdue: number;
  dueToday: number;
  open: number;
  mine: number;
}

export interface TodoPreferences {
  email: boolean;
  push: boolean;
  collective: boolean;
  /** The server can send browser pop-ups. */
  pushAvailable: boolean;
  /** Devices of this person already subscribed. */
  pushDevices: number;
}

export interface TodoHistoryPage {
  items: Todo[];
  nextCursor: number | null;
}

export interface InboxItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface InboxList {
  unread: number;
  items: InboxItem[];
}

export interface CreateTodoDto {
  title: string;
  dueDate?: string;
  scope?: TodoScope;
  priority?: TodoPriority;
  description?: string;
  dueTime?: string;
  remindBeforeMinutes?: number;
  groupId?: number;
  assigneeId?: number;
  /** Creates a subtask; scope and group come from the parent. */
  parentId?: number;
}

export interface UpdateTodoDto {
  title?: string;
  dueDate?: string | null;
  isCompleted?: boolean;
  priority?: TodoPriority;
  /** null clears the notes. */
  description?: string | null;
  /** null removes the time of day. */
  dueTime?: string | null;
  /** null goes back to the default lead time. */
  remindBeforeMinutes?: number | null;
  /** null removes the assignment. */
  assigneeId?: number | null;
  /** null detaches the todo from its group. */
  groupId?: number | null;
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
