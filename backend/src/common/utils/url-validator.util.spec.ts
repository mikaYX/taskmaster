import { validateUrl, isPrivateIp, safeFetch } from './url-validator.util';
import fetch from 'node-fetch';

jest.mock('node-fetch');

describe('UrlValidator', () => {
  describe('isPrivateIp', () => {
    it('should identify IPv4 loopback', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('127.100.10.1')).toBe(true);
    });

    it('should identify IPv4 private classes', () => {
      expect(isPrivateIp('10.0.0.5')).toBe(true);
      expect(isPrivateIp('192.168.1.100')).toBe(true);
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('172.31.255.255')).toBe(true);
    });

    it('should identify AWS/Cloud metadata IP', () => {
      expect(isPrivateIp('169.254.169.254')).toBe(true);
    });

    it('should identify public IPs as not private', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false);
      expect(isPrivateIp('1.1.1.1')).toBe(false);
      expect(isPrivateIp('172.217.18.238')).toBe(false); // Google
    });

    it('should identify IPv6 localhost', () => {
      expect(isPrivateIp('::1')).toBe(true);
    });
  });

  describe('validateUrl', () => {
    it('should reject invalid URL strings', async () => {
      await expect(validateUrl('not-a-url')).rejects.toThrow(
        'Invalid URL format',
      );
    });

    it('should reject file:// or ftp:// protocols', async () => {
      await expect(validateUrl('ftp://test.com')).rejects.toThrow(
        'Unsupported protocol',
      );
      await expect(validateUrl('file:///etc/passwd')).rejects.toThrow(
        'Unsupported protocol',
      );
    });

    it('should reject HTTP by default', async () => {
      await expect(validateUrl('http://google.com')).rejects.toThrow(
        'HTTP protocol is not allowed',
      );
    });

    it('should allow HTTP if explicitly enabled', async () => {
      const { parsedUrl } = await validateUrl('http://google.com', {
        allowHttp: true,
      });
      expect(parsedUrl.protocol).toBe('http:');
    });

    it('should reject URLs with embedded credentials', async () => {
      await expect(
        validateUrl('https://admin:password@google.com'),
      ).rejects.toThrow('URL credentials are not allowed');
    });

    it('should reject URLs resolving to localhost', async () => {
      await expect(validateUrl('https://localhost')).rejects.toThrow(
        /private or reserved IP/,
      );
    });

    it('should allow public URLs', async () => {
      const { parsedUrl } = await validateUrl('https://google.com');
      expect(parsedUrl.hostname).toBe('google.com');
    });
  });

  describe('safeFetch', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should execute fetch successfully for an allowed URL', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValueOnce({
        status: 200,
        ok: true,
      });

      const res = await safeFetch('https://google.com');
      expect(res.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should timeout if the request takes too long', async () => {
      (fetch as unknown as jest.Mock).mockImplementationOnce(() => {
        return new Promise((resolve, reject) => {
          setTimeout(
            () =>
              reject(
                new DOMException('The operation was aborted', 'AbortError'),
              ),
            200,
          );
        });
      });

      await expect(
        safeFetch('https://google.com', undefined, { timeoutMs: 100 }),
      ).rejects.toThrow('Request timeout after 100ms');
    });

    it('should reject SSRF attempt before calling fetch', async () => {
      await expect(
        safeFetch('https://169.254.169.254/latest/meta-data/'),
      ).rejects.toThrow(/private or reserved IP/);

      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
