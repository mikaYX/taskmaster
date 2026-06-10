import { anonymizeIp } from './ip-anonymizer.util';

describe('anonymizeIp', () => {
  const ORIGINAL_ENV = process.env.IP_ANONYMIZATION_ENABLED;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.IP_ANONYMIZATION_ENABLED;
    } else {
      process.env.IP_ANONYMIZATION_ENABLED = ORIGINAL_ENV;
    }
  });

  describe('nullish / sentinel passthrough', () => {
    it('returns null for null input', () => {
      expect(anonymizeIp(null)).toBeNull();
    });

    it('returns undefined for undefined input', () => {
      expect(anonymizeIp(undefined)).toBeUndefined();
    });

    it('returns empty string for empty input', () => {
      expect(anonymizeIp('')).toBe('');
    });

    it('preserves the "unknown" sentinel used by AuthService.recordFailedLogin', () => {
      expect(anonymizeIp('unknown')).toBe('unknown');
    });
  });

  describe('IPv4 (last octet masked)', () => {
    it('masks the last octet of a public address', () => {
      expect(anonymizeIp('8.8.8.8')).toBe('8.8.8.0');
    });

    it('masks the last octet of a private address', () => {
      expect(anonymizeIp('192.168.1.42')).toBe('192.168.1.0');
    });

    it('preserves first three octets unchanged', () => {
      expect(anonymizeIp('10.0.0.255')).toBe('10.0.0.0');
    });

    it('handles 0.0.0.0', () => {
      expect(anonymizeIp('0.0.0.0')).toBe('0.0.0.0');
    });

    it('returns null for invalid octets above 255', () => {
      expect(anonymizeIp('192.168.1.256')).toBeNull();
    });

    it('returns null for partial IPv4', () => {
      expect(anonymizeIp('192.168.1')).toBeNull();
    });

    it('returns null for too-many-octets IPv4', () => {
      expect(anonymizeIp('1.2.3.4.5')).toBeNull();
    });
  });

  describe('IPv6 (last 80 bits masked)', () => {
    it('masks the last 80 bits of a full address', () => {
      expect(anonymizeIp('2001:db8:abcd:0012:1234:5678:9abc:def0')).toBe(
        '2001:db8:abcd::',
      );
    });

    it('masks a compressed address keeping the network prefix', () => {
      expect(anonymizeIp('2001:db8:abcd::1')).toBe('2001:db8:abcd::');
    });

    it('collapses to "::" when the first 48 bits are all zero', () => {
      expect(anonymizeIp('::1')).toBe('::');
    });

    it('preserves the 48-bit prefix when only 2 hextets are non-zero', () => {
      expect(anonymizeIp('2001:db8::1')).toBe('2001:db8::');
    });

    it('handles link-local addresses', () => {
      expect(anonymizeIp('fe80::1234:5678')).toBe('fe80::');
    });

    it('strips a zone-id suffix before anonymizing', () => {
      expect(anonymizeIp('fe80::1%eth0')).toBe('fe80::');
    });

    it('normalizes uppercase hexadecimal to lowercase', () => {
      expect(anonymizeIp('2001:DB8:ABCD::1')).toBe('2001:db8:abcd::');
    });

    it('strips leading zeros from kept hextets', () => {
      expect(anonymizeIp('2001:0db8:00cd::1')).toBe('2001:db8:cd::');
    });

    it('returns null for IPv6 with more than one "::"', () => {
      expect(anonymizeIp('2001::db8::1')).toBeNull();
    });

    it('returns null for IPv6 with too many hextets', () => {
      expect(anonymizeIp('2001:db8:1:2:3:4:5:6:7')).toBeNull();
    });

    it('returns null for IPv6 with invalid hextet characters', () => {
      expect(anonymizeIp('2001:dgg8::1')).toBeNull();
    });

    it('anonymizes the embedded IPv4 in an IPv4-mapped IPv6', () => {
      expect(anonymizeIp('::ffff:192.168.1.42')).toBe('::ffff:192.168.1.0');
    });
  });

  describe('malformed / unsupported input', () => {
    it('returns null for arbitrary string', () => {
      expect(anonymizeIp('not-an-ip')).toBeNull();
    });

    it('returns null for hostname', () => {
      expect(anonymizeIp('example.com')).toBeNull();
    });
  });

  describe('env-flag IP_ANONYMIZATION_ENABLED=false', () => {
    it('returns the original IPv4 when explicitly disabled', () => {
      process.env.IP_ANONYMIZATION_ENABLED = 'false';
      expect(anonymizeIp('192.168.1.42')).toBe('192.168.1.42');
    });

    it('returns the original IPv6 when explicitly disabled', () => {
      process.env.IP_ANONYMIZATION_ENABLED = 'false';
      expect(anonymizeIp('2001:db8::1')).toBe('2001:db8::1');
    });

    it('still preserves nullish / sentinel when disabled', () => {
      process.env.IP_ANONYMIZATION_ENABLED = 'false';
      expect(anonymizeIp(null)).toBeNull();
      expect(anonymizeIp('unknown')).toBe('unknown');
    });

    it('treats any value other than the literal string "false" as enabled', () => {
      process.env.IP_ANONYMIZATION_ENABLED = 'FALSE';
      expect(anonymizeIp('192.168.1.42')).toBe('192.168.1.0');

      process.env.IP_ANONYMIZATION_ENABLED = '0';
      expect(anonymizeIp('192.168.1.42')).toBe('192.168.1.0');

      process.env.IP_ANONYMIZATION_ENABLED = 'true';
      expect(anonymizeIp('192.168.1.42')).toBe('192.168.1.0');
    });
  });
});
