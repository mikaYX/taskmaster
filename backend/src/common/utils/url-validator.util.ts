import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import fetch, { RequestInit, Response } from 'node-fetch';
import { AbortController } from 'abort-controller';

/**
 * Options for URL Validation
 */
export interface UrlValidationOptions {
  /** Allow targeting private IP ranges (RFC 1918, localhost, loopback). Default: false */
  allowPrivateIps?: boolean;
  /** Allow original HTTP scheme (will reject if false). Default: false */
  allowHttp?: boolean;
  /** Timeout in milliseconds for the fetch request. Default: 5000 */
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: UrlValidationOptions = {
  allowPrivateIps: false,
  allowHttp: false,
  timeoutMs: 5000,
};

/**
 * Validates if an IP address is considered private or reserved.
 * Covers IPv4 and IPv6 loopback, site-local, link-local, and specific AWS/Cloud metadata IPs.
 */
export function isPrivateIp(ip: string): boolean {
  // IPv4 ranges
  if (
    ip.startsWith('127.') || // Loopback (127.0.0.0/8)
    ip.startsWith('10.') || // Private (10.0.0.0/8)
    ip.startsWith('192.168.') || // Private (192.168.0.0/16)
    ip.startsWith('169.254.') || // Link-local (AWS Metadata) (169.254.0.0/16)
    ip === '0.0.0.0' // Unspecified
  ) {
    return true;
  }

  // IPv4 Private 172.16.0.0/12
  if (ip.startsWith('172.')) {
    const secondOctet = parseInt(ip.split('.')[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  // IPv6
  if (
    ip === '::1' || // Loopback
    ip === '::' || // Unspecified
    ip.toLowerCase().startsWith('fc00:') || // Unique local
    ip.toLowerCase().startsWith('fd00:') || // Unique local
    ip.toLowerCase().startsWith('fe80:') // Link-local
  ) {
    return true;
  }

  // Known metadata hostnames bypassing IP check (if DNS resolves locally to cache)
  return false;
}

/**
 * Wrapper for DNS lookup using Promises
 */
function lookupPromise(hostname: string): Promise<string> {
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, (err, address) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

/**
 * Validate an URL against SSRF attacks.
 * 1. Checks protocol (HTTPS enforced by default)
 * 2. Resolves DNS to check real IP address
 * 3. Blocks Private/Internal IPs (by default)
 *
 * @throws Error if validation fails
 * @returns { parsedUrl: URL, ipAddress: string }
 */
export async function validateUrl(
  targetUrl: string,
  options: UrlValidationOptions = DEFAULT_OPTIONS,
): Promise<{ parsedUrl: URL; ipAddress: string }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (error) {
    throw new Error('Invalid URL format');
  }

  // Protocol Check
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error(
      `Unsupported protocol: ${parsedUrl.protocol}. Only http and https are allowed.`,
    );
  }

  if (!opts.allowHttp && parsedUrl.protocol === 'http:') {
    throw new Error('HTTP protocol is not allowed. Use HTTPS.');
  }

  // Prevent credentials in URL (e.g. https://user:pass@host.com)
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('URL credentials are not allowed');
  }

  // Resolve DNS to get real IP and prevent DNS Rebinding on simple payload
  let address: string;
  try {
    address = await lookupPromise(parsedUrl.hostname);

    // Check against Private IP ranges
    if (!opts.allowPrivateIps && isPrivateIp(address)) {
      throw new Error(
        `URL resolves to a private or reserved IP address (${address}), which is forbidden.`,
      );
    }
  } catch (error: any) {
    if (error.message && error.message.includes('private or reserved IP')) {
      throw error;
    }
    throw new Error(
      `DNS resolution failed for hostname: ${parsedUrl.hostname}`,
    );
  }

  return { parsedUrl, ipAddress: address };
}

/**
 * A safe fetch wrapper that validates the URL against SSRF before execution,
 * and enforces a request timeout.
 */
export async function safeFetch(
  url: string,
  init?: RequestInit,
  options?: UrlValidationOptions,
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 1. Validate the URL (DNS lookup & private IP check)
  const { parsedUrl, ipAddress } = await validateUrl(url, opts);

  // 2. Create custom agent bounding the hostname to the pre-checked IP
  const agentOpts = {
    lookup: (hostname: string, lookupOptions: any, callback: any) => {
      // Force resolution to the IP we already checked (Prevent DNS Rebinding)
      const family = net.isIPv6(ipAddress) ? 6 : 4;
      callback(null, ipAddress, family);
    },
  };
  const agent =
    parsedUrl.protocol === 'https:'
      ? new https.Agent(agentOpts)
      : new http.Agent(agentOpts);

  // 3. Setup Timeout Controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    // 4. Force using Node-fetch with the custom pinned agent
    const fetchOptions: RequestInit = {
      ...init,
      agent,
      signal: controller.signal as any,
    };

    const response = await fetch(url, fetchOptions);
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${opts.timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
