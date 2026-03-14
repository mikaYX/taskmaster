# Authentication Abuse Protection

WeAssess Taskmaster incorporates layers of protection against credential stuffing, brute-force attacks, and distributed flood attacks targeting the authentication flow.

## 1. Top-Level Rate Limiting (Throttling)

Global and route-specific rate limits are enforced at the Controller level using `@nestjs/throttler`. This protects against volumetric floods.

| Endpoint | Limit | Window |
|---|---|---|
| `POST /auth/login` | 5 demands | 1 minute |
| `POST /auth/mfa/verify` | 5 demands | 1 minute |
| `POST /auth/external/exchange` | 10 demands | 1 minute |

## 2. Progressive Lockout (Sliding Window)

At the service layer (`AuthService`), a Redis-backed Progressive Lockout prevents persistent brute-forcing while minimizing denial-of-service risks for legitimate users. Lockouts track both the **Identity (Username/Email)** and the **Source IP** simultaneously. 

If either threshold is breached, the `checkLockout` guard blocks login and throws a 401 Unauthorized (`Too many failed attempts. Account temporarily locked`).

### Thresholds & Penalties
1. **Level 1 (Warning)**: 
   - Rule: 5 failures within a 30-minute window.
   - Penalty: 5-minute strict block.
   - Metric Log: `[AUTH_ALERT_SPIKE_DETECTED] Moderate failure rate...`

2. **Level 2 (Severe)**:
   - Rule: 10 failures within a 30-minute window.
   - Penalty: 30-minute strict block.
   - Metric Log: `[AUTH_ALERT_SPIKE_DETECTED] High failure rate...`

*A single successful login strictly resets both the Identity and IP counters & penalties to zero.*

## 3. Observability & Motif Tracking

Every authentication attempt correctly yields an immutable tracking log designed for SIEM platforms without leaking plaintext credentials or sensitive PII payloads.

- `[AUTH_METRIC_FAIL] motif=<Motif> identity=<User> ip=<IP>`
- `[AUTH_METRIC_SUCCESS] Login successful for identity=<User> ip=<IP>`
- `[AUTH_METRIC_LOCKED_OUT] Login attempt blocked...`

Supported failure motifs for telemetry graphing include:
- `USER_NOT_FOUND`
- `WRONG_PROVIDER`
- `NO_PASSWORD`
- `BAD_PASSWORD`
- `INVALID_MFA_TOKEN_TYPE`
- `INVALID_MFA_CODE`
- `ACCOUNT_COLLISION_LDAP`

By funneling these structured logs into Grafana or ELK, administrators can define alerts for anomalous success/fail ratios or repetitive motifs.
