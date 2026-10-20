/**
 * Turns a provider failure into a sentence an administrator can act on.
 * Providers swallow their exceptions (a failed mail must never break the caller),
 * so without this the reason of a failure was only visible in the server log.
 */
export function describeEmailError(error: unknown): string {
  const err = (error ?? {}) as {
    code?: string;
    responseCode?: number;
    response?: unknown;
    message?: string;
    statusCode?: number;
  };
  const detail = (err.message ?? String(error)).split('\n')[0].slice(0, 300);
  const status = err.responseCode ?? err.statusCode;

  if (err.code === 'EAUTH' || status === 535 || status === 401) {
    return `Authentication refused by the mail server (check the user name and password): ${detail}`;
  }
  if (err.code === 'ENOTFOUND' || err.code === 'EDNS') {
    return `Mail server host not found (check the host name and DNS): ${detail}`;
  }
  if (err.code === 'ECONNREFUSED') {
    return `Connection refused by the mail server (check the host, the port and any firewall): ${detail}`;
  }
  if (
    err.code === 'ETIMEDOUT' ||
    err.code === 'ESOCKET' ||
    err.code === 'ECONNECTION'
  ) {
    return `Could not reach the mail server in time (check the host, the port, the TLS setting and any firewall): ${detail}`;
  }
  if (/certificate|self[- ]signed|SSL|TLS|wrong version number/i.test(detail)) {
    return `TLS/certificate problem with the mail server (port 465 uses SSL, 587 uses STARTTLS): ${detail}`;
  }
  if (status === 403) {
    return `The provider refused the request (check the API key rights and the sender address): ${detail}`;
  }
  if (err.code === 'EENVELOPE' || status === 550 || status === 553) {
    return `Sender or recipient rejected by the mail server: ${detail}`;
  }
  return detail || 'Unknown mail error';
}
