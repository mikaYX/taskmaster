import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as semver from 'semver';

export interface VersionStatusDto {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  repo: string;
  releaseUrl: string | null;
  checkedAt: string;
  sourceStatus: 'ok' | 'degraded';
  error: string | null;
}

const DEFAULT_REPO = 'mikaYX/taskmaster';
const CACHE_TTL_OK_MS = 15 * 60 * 1000;
const CACHE_TTL_DEGRADED_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;

@Injectable()
export class VersionService {
  private readonly logger = new Logger(VersionService.name);
  private readonly currentVersion: string;
  private cache: { data: VersionStatusDto; expiresAt: number } | null = null;
  private inflightPromise: Promise<VersionStatusDto> | null = null;

  constructor(private readonly config: ConfigService) {
    this.currentVersion = this.resolveCurrentVersion();
    this.logger.log(`Application version: ${this.currentVersion}`);
  }

  async getVersionStatus(): Promise<VersionStatusDto> {
    if (this.cache && Date.now() < this.cache.expiresAt) {
      return this.cache.data;
    }

    if (this.inflightPromise) {
      return this.inflightPromise;
    }

    this.inflightPromise = this.fetchAndCache();
    try {
      return await this.inflightPromise;
    } finally {
      this.inflightPromise = null;
    }
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  private async fetchAndCache(): Promise<VersionStatusDto> {
    const repo = this.getRepo();
    let latestVersion: string | null = null;
    let releaseUrl: string | null = null;
    let sourceStatus: 'ok' | 'degraded' = 'ok';
    let error: string | null = null;

    try {
      const release = await this.fetchLatestRelease(repo);
      latestVersion = release.version;
      releaseUrl = release.url;
    } catch (releaseErr) {
      this.logger.warn(
        `GitHub Releases API failed for ${repo}: ${releaseErr}`,
      );
      try {
        latestVersion = await this.fetchPackageJsonVersion(repo);
        sourceStatus = 'degraded';
      } catch (pkgErr) {
        sourceStatus = 'degraded';
        error = 'Unable to check for updates';
        this.logger.warn(
          `GitHub package.json fallback failed for ${repo}: ${pkgErr}`,
        );
      }
    }

    const cleanLatest = latestVersion ? this.cleanVersion(latestVersion) : null;
    const cleanCurrent = this.cleanVersion(this.currentVersion);

    const parsedLatest = cleanLatest ? semver.valid(cleanLatest) : null;
    const parsedCurrent = semver.valid(cleanCurrent);

    const updateAvailable =
      parsedLatest &&
      parsedCurrent &&
      !semver.prerelease(parsedLatest) &&
      semver.gt(parsedLatest, parsedCurrent);

    if (!releaseUrl && parsedLatest) {
      releaseUrl = `https://github.com/${repo}/releases/tag/v${parsedLatest}`;
    }

    const dto: VersionStatusDto = {
      currentVersion: cleanCurrent,
      latestVersion: parsedLatest ?? cleanLatest,
      updateAvailable: !!updateAvailable,
      repo,
      releaseUrl,
      checkedAt: new Date().toISOString(),
      sourceStatus,
      error,
    };

    const ttl =
      sourceStatus === 'ok' ? CACHE_TTL_OK_MS : CACHE_TTL_DEGRADED_MS;
    this.cache = { data: dto, expiresAt: Date.now() + ttl };

    return dto;
  }

  private getRepo(): string {
    return (
      this.config.get<string>('VERSION_CHECK_REPO') || DEFAULT_REPO
    );
  }

  private cleanVersion(version: string): string {
    return version.replace(/^v/, '');
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Taskmaster-VersionCheck',
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchLatestRelease(
    repo: string,
  ): Promise<{ version: string; url: string }> {
    const response = await this.fetchWithTimeout(
      `https://api.github.com/repos/${repo}/releases/latest`,
    );

    if (!response.ok) {
      throw new Error(`GitHub Releases API returned ${response.status}`);
    }

    const data = (await response.json()) as {
      tag_name: string;
      html_url: string;
    };

    return {
      version: this.cleanVersion(data.tag_name),
      url: data.html_url,
    };
  }

  private async fetchPackageJsonVersion(repo: string): Promise<string> {
    const response = await this.fetchWithTimeout(
      `https://raw.githubusercontent.com/${repo}/main/package.json`,
    );

    if (!response.ok) {
      throw new Error(`GitHub raw content returned ${response.status}`);
    }

    const data = (await response.json()) as { version: string };
    return data.version;
  }

  resolveCurrentVersion(): string {
    const candidates = [
      join(process.cwd(), 'package.json'),
      join(__dirname, '..', '..', 'package.json'),
      join(__dirname, '..', '..', '..', 'package.json'),
    ];

    for (const candidate of candidates) {
      try {
        const content = readFileSync(candidate, 'utf-8');
        const pkg = JSON.parse(content) as { version?: string };
        if (pkg.version && semver.valid(pkg.version)) {
          return pkg.version;
        }
      } catch {
        // Try next candidate
      }
    }

    return process.env.npm_package_version || 'unknown';
  }
}
