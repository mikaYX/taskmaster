import { Logger } from '@nestjs/common';
import { createConnection } from 'net';

const logger = new Logger('StartupDependencyCheck');

interface HostPort {
  host: string;
  port: number;
}

function parseHostPort(
  url: string | undefined,
  defaultPort: number,
): HostPort | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return null;
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : defaultPort,
    };
  } catch {
    return null;
  }
}

function probeOnce(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host, port, timeout: timeoutMs });
    const finish = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolvePromise(ok);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

async function waitForHostPort(
  name: string,
  host: string,
  port: number,
  deadline: number,
): Promise<void> {
  let delayMs = 500;
  for (;;) {
    const ok = await probeOnce(host, port, 2000);
    if (ok) {
      logger.log(`${name} reachable at ${host}:${port}`);
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${name} at ${host}:${port}`);
    }
    logger.warn(`${name} not reachable yet at ${host}:${port}, retrying...`);
    await new Promise((r) => setTimeout(r, delayMs));
    delayMs = Math.min(delayMs * 1.5, 5000);
  }
}

/**
 * Blocks startup until PostgreSQL/Redis are accepting TCP connections, or throws
 * after TASKMASTER_STARTUP_TIMEOUT_SECONDS (default 60). A Windows Service's SCM
 * "depend on" ordering only guarantees the dependent service reports Running, not
 * that it's actually accepting connections yet — this closes that gap.
 */
export async function waitForDependencies(): Promise<void> {
  const timeoutSeconds = Number(
    process.env.TASKMASTER_STARTUP_TIMEOUT_SECONDS || 60,
  );
  const deadline = Date.now() + timeoutSeconds * 1000;

  const targets: Array<{ name: string } & HostPort> = [];
  const db = parseHostPort(process.env.DATABASE_URL, 5432);
  if (db) targets.push({ name: 'PostgreSQL', ...db });
  const redis = parseHostPort(process.env.REDIS_URL, 6379);
  if (redis) targets.push({ name: 'Redis', ...redis });

  if (targets.length === 0) return;

  logger.log(
    `Waiting up to ${timeoutSeconds}s for: ${targets.map((t) => t.name).join(', ')}`,
  );
  await Promise.all(
    targets.map((t) => waitForHostPort(t.name, t.host, t.port, deadline)),
  );
}
