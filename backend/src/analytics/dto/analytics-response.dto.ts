export interface OverviewResponse {
  success: number;
  failed: number;
  running: number;
  missing: number;
  total: number;
  complianceRate: number;
}

export interface TrendPoint {
  date: string;
  success: number;
  failed: number;
  missing: number;
}

export interface TaskComplianceItem {
  taskId: number;
  taskName: string;
  total: number;
  success: number;
  failed: number;
  missing: number;
  complianceRate: number;
}

export interface UserComplianceItem {
  userId: number;
  username: string;
  fullname: string;
  total: number;
  success: number;
  failed: number;
  complianceRate: number;
}
