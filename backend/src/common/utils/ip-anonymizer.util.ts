/**
 * IP anonymizer — write-only helper for PII minimization.
 *
 * Implements AUDIT.md Finding #8 (§15.3): strip identifying bits from an IP
 * address before persisting it to `refresh_tokens.ip_address` or
 * `audit_logs.ip_address`. This is required by GDPR Art. 5(1)(c) (data
 * minimization) and aligns with CNIL guidance + `.agents/rgpd/SKILL.md` §7.
 *
 * Scope:
 * - IPv4 → mask last octet            (`192.168.1.42` → `192.168.1.0`)
 * - IPv6 → mask last 80 bits          (`2001:db8::1`  → `2001:db8::`)
 * - IPv4-mapped IPv6 → mask the embedded IPv4 only.
 *
 * Non-goals:
 * - Backfill of historical rows. Existing values stay as-is until the
 *   retention cron purges them (cf. `cleanup-audit-logs.job.ts`).
 * - Network/lockout decisions. Redis keys for rate-limit / lockout MUST keep
 *   the full IP — anonymization happens at the persistence boundary only.
 *
 * Opt-out:
 * - Set `IP_ANONYMIZATION_ENABLED=false` to bypass the helper temporarily
 *   (incident forensics only). Any other value (including absence) keeps
 *   anonymization enabled.
 */

/** Sentinel value already used by `auth.service.ts` for missing IP. */
const UNKNOWN_SENTINEL = 'unknown';

/** Number of 16-bit hextets kept from an IPv6 address (48-bit network prefix). */
const IPV6_KEPT_HEXTETS = 3;

/** Strict IPv4 dotted-quad regex (no leading sign, no trailing junk). */
const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** IPv4-mapped IPv6 prefix detector (e.g. `::ffff:192.168.1.42`). */
const IPV4_MAPPED_REGEX = /^([0-9a-f:]*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

/**
 * Returns `true` when the env-flag is set to disable anonymization.
 * Defaults to `false` (i.e. anonymization stays ON) for safety.
 */
function isDisabled(): boolean {
  return process.env.IP_ANONYMIZATION_ENABLED === 'false';
}

/**
 * Anonymize an IP address for storage.
 *
 * Nullish / empty / `'unknown'` sentinel values are preserved unchanged so
 * that downstream `String?` columns retain their existing semantics.
 *
 * Malformed inputs (anything that is neither a valid IPv4 nor a valid IPv6)
 * are mapped to `null` — safer than persisting an unparsed string that might
 * leak the original value.
 */
export function anonymizeIp(
  ip: string | null | undefined,
): string | null | undefined {
  if (ip === null || ip === undefined || ip === '') {
    return ip;
  }
  if (ip === UNKNOWN_SENTINEL) {
    return ip;
  }
  if (isDisabled()) {
    return ip;
  }

  // Strip any zone-id suffix (e.g. `fe80::1%eth0`) before parsing.
  const addrPart = ip.includes('%') ? ip.split('%', 1)[0] : ip;

  const v4Match = IPV4_REGEX.exec(addrPart);
  if (v4Match) {
    return anonymizeIpv4(v4Match[1], v4Match[2], v4Match[3], v4Match[4]);
  }

  if (addrPart.includes(':')) {
    return anonymizeIpv6(addrPart);
  }

  // Unknown format — drop the value rather than persist the original.
  return null;
}

function anonymizeIpv4(
  a: string,
  b: string,
  c: string,
  d: string,
): string | null {
  for (const octet of [a, b, c, d]) {
    const n = Number(octet);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      return null;
    }
  }
  return `${a}.${b}.${c}.0`;
}

function anonymizeIpv6(ip: string): string | null {
  const lower = ip.toLowerCase();

  // IPv4-mapped IPv6 (e.g. `::ffff:192.168.1.42`): anonymize the embedded v4.
  const v4Embedded = IPV4_MAPPED_REGEX.exec(lower);
  if (v4Embedded) {
    const maskedV4 = anonymizeIp(v4Embedded[2]);
    if (typeof maskedV4 !== 'string') {
      return null;
    }
    return `${v4Embedded[1]}${maskedV4}`;
  }

  // Expand `::` to its full 8-hextet form for parsing.
  const groups = expandIpv6(lower);
  if (!groups) {
    return null;
  }

  // Keep the network prefix (48 bits = 3 hextets), zero the remaining 80 bits.
  const kept = groups.slice(0, IPV6_KEPT_HEXTETS);
  while (kept.length > 0 && kept[kept.length - 1] === '0') {
    kept.pop(); // Trim trailing zero hextets for canonical RFC 5952 output.
  }
  return kept.length === 0 ? '::' : `${kept.join(':')}::`;
}

/**
 * Expand an IPv6 address (possibly compressed) into exactly 8 lowercase
 * hextets. Returns `null` if the input is malformed.
 */
function expandIpv6(ip: string): string[] | null {
  // Reject inputs with more than one `::` (illegal per RFC 4291).
  const doubleColonCount = (ip.match(/::/g) ?? []).length;
  if (doubleColonCount > 1) {
    return null;
  }

  let head: string[];
  let tail: string[];

  if (doubleColonCount === 1) {
    const [headPart, tailPart] = ip.split('::');
    head = headPart === '' ? [] : headPart.split(':');
    tail = tailPart === '' ? [] : tailPart.split(':');
    const missing = 8 - head.length - tail.length;
    if (missing < 0) {
      return null;
    }
    head = head.concat(new Array<string>(missing).fill('0'));
  } else {
    head = ip.split(':');
    tail = [];
  }

  const groups = head.concat(tail);
  if (groups.length !== 8) {
    return null;
  }
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) {
      return null;
    }
  }
  // Normalize: strip leading zeros within each hextet (`0db8` → `db8`, `0000` → `0`).
  return groups.map((g) => g.replace(/^0+(?=.)/, ''));
}
