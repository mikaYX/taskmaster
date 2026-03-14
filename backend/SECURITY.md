# Security Documentation

## Overview

This document describes the security measures implemented in the Taskmaster Next backend.

---

## Security Checklist

### ✅ Authentication & Authorization

| Control | Status | Implementation |
|---------|--------|----------------|
| JWT Authentication | ✅ | Access tokens (15min), refresh tokens (7 days) |
| Refresh Token Rotation | ✅ | SHA-256 hashed, family-based revocation |
| Role-Based Access Control | ✅ | ADMIN, USER, GUEST roles |
| Password Hashing | ✅ | bcrypt with salt rounds |
| Token Theft Detection | ✅ | Revokes entire token family on reuse |

### ✅ Input Validation

| Control | Status | Implementation |
|---------|--------|----------------|
| Global Validation Pipe | ✅ | class-validator on all DTOs |
| Whitelist Mode | ✅ | Strips unknown properties |
| ForbidNonWhitelisted | ✅ | Rejects requests with extra fields |
| Zod Validation (Settings) | ✅ | Per-key schema validation |

### ✅ HTTP Security Headers

| Header | Status | Implementation |
|--------|--------|----------------|
| X-Content-Type-Options | ✅ | Helmet (nosniff) |
| X-Frame-Options | ✅ | Helmet (SAMEORIGIN) |
| X-XSS-Protection | ✅ | Helmet |
| Strict-Transport-Security | ✅ | Helmet (production) |
| Content-Security-Policy | ✅ | Helmet (production only) |

### ✅ Rate Limiting

| Control | Status | Implementation |
|---------|--------|----------------|
| Global Rate Limit | ✅ | 60 requests/minute/IP |
| ThrottlerModule | ✅ | @nestjs/throttler |

### ✅ Error Handling

| Control | Status | Implementation |
|---------|--------|----------------|
| Sanitized Responses | ✅ | GlobalExceptionFilter |
| No Stack Traces (prod) | ✅ | Debug info only in development |
| Structured Logging | ✅ | Full errors logged server-side |

### ✅ Data Protection

| Control | Status | Implementation |
|---------|--------|----------------|
| Sensitive Settings Encryption | ✅ | AES-256-GCM at rest |
| Passwords Masked in Response | ✅ | `••••••••` for sensitive values |
| No Secrets in Logs | ✅ | Credentials never logged |

### ✅ Path Security

| Control | Status | Implementation |
|---------|--------|----------------|
| Export Path Traversal | ✅ | Server-controlled directories |
| Backup Path Traversal | ✅ | Strict filename validation |
| File Size Limits | ✅ | 500MB max for backups |

---

## Residual Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| CORS wildcard in dev | Low | Configured to `false` in production |
| No 2FA | Medium | Future enhancement - not in scope |
| No brute-force lockout | Medium | Rate limiting provides basic protection |
| JWT in localStorage | Medium | Client-side concern, mitigated by short TTL |
| No audit log | Low | Logging in place, no persistent audit trail |

---

## Security Recommendations (Future)

1. **Add brute-force protection** - Lock accounts after X failed attempts
2. **Implement 2FA** - TOTP for admin accounts
3. **Add persistent audit log** - Database table for security events
4. **Configure CSP in production** - Specific content security policy
5. **Add request signing** - For sensitive operations

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `AUTH_SECRET` | JWT signing + encryption key derivation | ✅ |
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `NODE_ENV` | Environment (development/production) | ✅ |
| `PORT` | Server port | Optional (default: 3000) |

---

## Dependencies Security

```bash
# Check for vulnerabilities
npm audit

# Current status
found 0 vulnerabilities
```

---

*Generated: 2026-02-01*
