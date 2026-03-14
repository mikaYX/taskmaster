import { SetMetadata } from '@nestjs/common';
import {
  AuditActionType,
  AuditCategory,
  AuditSeverity,
} from '../audit.constants';

export const AUDIT_KEY = 'audit_meta';

export interface AuditDecoratorOptions {
  action: AuditActionType;
  category: AuditCategory;
  severity?: AuditSeverity;
  failureAction?: AuditActionType;
}

export const Audit = (options: AuditDecoratorOptions) =>
  SetMetadata(AUDIT_KEY, options);
