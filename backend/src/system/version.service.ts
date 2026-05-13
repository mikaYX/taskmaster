import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as semver from 'semver';
import { safeFetch } from '../common/utils/url-validator.util';
import { type RequestInit, Response } from 'node-fetch';

const GITHUB_API_BASE = 'https://api.github.com/repos';
const GITHUB_WEB_BASE = 'https://github.com';
const DOCKER_HUB_API_BASE = 'https://hub.docker.com/v2/namespaces';
const DOCKER_HUB_WEB_BASE = 'https://hub.docker.com/r';

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
const VERSION_CHECK_ERROR = 'Unable to check for updates';
const DOCKER_HUB_PAGE_SIZE = 100;
const DOCKER_HUB_MAX_PAGES = 5;
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DOCKER_REPOSITORY_PART_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const DOCKER_HUB_HOSTS = new Set([
  'docker.io',
  'index.docker.io',
  'registry-1.docker.io',
]);

type VersionSourceType = 'github' | 'docker-hub';

interface GitHubVersionSource {
  type: 'github';
  reference: string;
  repo: string;
}

interface DockerHubImageRef {
  namespace: string;
  repository: string;
  tag: string | null;
}

interface DockerHubVersionSource {
  type: 'docker-hub';
  reference: string;
  image: DockerHubImageRef;
}

type VersionSource = GitHubVersionSource | DockerHubVersionSource;

interface VersionLookupResult {
  latestVersion: string | null;
  releaseUrl: string | null;
  sourceStatus: 'ok' | 'degraded';
  error: string | null;
}

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

    return this.fetchFreshStatus();
  }

  async refreshVersionStatus(): Promise<VersionStatusDto> {
    this.cache = null;

    return this.fetchFreshStatus();
  }

  private async fetchFreshStatus(): Promise<VersionStatusDto> {

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
    const source = this.resolveVersionSource();
    const lookup = await this.lookupLatestVersion(source);
    const cleanLatest = lookup.latestVersion
      ? this.cleanVersion(lookup.latestVersion)
      : null;
    const cleanCurrent = this.cleanVersion(this.currentVersion);

    const parsedLatest = cleanLatest ? semver.valid(cleanLatest) : null;
    const parsedCurrent = semver.valid(cleanCurrent);

    const updateAvailable =
      parsedLatest &&
      parsedCurrent &&
      !semver.prerelease(parsedLatest) &&
      semver.gt(parsedLatest, parsedCurrent);

    const dto: VersionStatusDto = {
      currentVersion: cleanCurrent,
      latestVersion: parsedLatest ?? cleanLatest,
      updateAvailable: !!updateAvailable,
      repo: source.reference,
      releaseUrl: lookup.releaseUrl,
      checkedAt: new Date().toISOString(),
      sourceStatus: lookup.sourceStatus,
      error: lookup.error,
    };

    const ttl =
      lookup.sourceStatus === 'ok' ? CACHE_TTL_OK_MS : CACHE_TTL_DEGRADED_MS;
    this.cache = { data: dto, expiresAt: Date.now() + ttl };

    return dto;
  }

  private resolveVersionSource(): VersionSource {
    const dockerSource = this.resolveDockerHubSource();

    if (dockerSource) {
      return dockerSource;
    }

    return this.resolveGitHubSource();
  }

  private resolveGitHubSource(): GitHubVersionSource {
    const configuredRepo = this.config.get<string>('VERSION_CHECK_REPO')?.trim();

    if (configuredRepo) {
      if (this.isValidGitHubRepo(configuredRepo)) {
        return {
          type: 'github',
          reference: configuredRepo,
          repo: configuredRepo,
        };
      }

      this.logger.warn(
        `Ignoring invalid VERSION_CHECK_REPO value: ${configuredRepo}`,
      );
    }

    return {
      type: 'github',
      reference: DEFAULT_REPO,
      repo: DEFAULT_REPO,
    };
  }

  private resolveDockerHubSource(): DockerHubVersionSource | null {
    const deploymentImage = this.parseDockerHubImageRef(
      this.config.get<string>('TASKMASTER_IMAGE'),
    );

    if (!deploymentImage) {
      return null;
    }

    const overrideImage = this.config
      .get<string>('VERSION_CHECK_DOCKER_IMAGE')
      ?.trim();

    if (overrideImage) {
      const parsedOverride = this.parseDockerHubImageRef(overrideImage);

      if (parsedOverride) {
        return {
          type: 'docker-hub',
          reference: `${parsedOverride.namespace}/${parsedOverride.repository}`,
          image: parsedOverride,
        };
      }

      this.logger.warn(
        `Ignoring invalid VERSION_CHECK_DOCKER_IMAGE value: ${overrideImage}`,
      );
    }

    return {
      type: 'docker-hub',
      reference: `${deploymentImage.namespace}/${deploymentImage.repository}`,
      image: deploymentImage,
    };
  }

  private async lookupLatestVersion(
    source: VersionSource,
  ): Promise<VersionLookupResult> {
    if (source.type === 'docker-hub') {
      return this.lookupLatestDockerHubVersion(source);
    }

    return this.lookupLatestGitHubVersion(source);
  }

  private async lookupLatestGitHubVersion(
    source: GitHubVersionSource,
  ): Promise<VersionLookupResult> {
    try {
      const release = await this.fetchLatestRelease(source.repo);
      return {
        latestVersion: release.version,
        releaseUrl: this.buildGitHubReleaseUrl(source.repo, release.tag),
        sourceStatus: 'ok',
        error: null,
      };
    } catch (releaseErr) {
      this.logger.warn(
        `GitHub Releases API failed for ${source.repo}: ${releaseErr}`,
      );
      try {
        const latestVersion = await this.fetchPackageJsonVersion(source.repo);
        return {
          latestVersion,
          releaseUrl: this.buildGitHubReleasesUrl(source.repo),
          sourceStatus: 'degraded',
          error: null,
        };
      } catch (pkgErr) {
        this.logger.warn(
          `GitHub package.json fallback failed for ${source.repo}: ${pkgErr}`,
        );

        return {
          latestVersion: null,
          releaseUrl: null,
          sourceStatus: 'degraded',
          error: VERSION_CHECK_ERROR,
        };
      }
    }
  }

  private async lookupLatestDockerHubVersion(
    source: DockerHubVersionSource,
  ): Promise<VersionLookupResult> {
    try {
      const latestTag = await this.fetchLatestDockerTag(source.image);

      if (!latestTag) {
        return {
          latestVersion: null,
          releaseUrl: this.buildDockerHubTagsUrl(source.image),
          sourceStatus: 'ok',
          error: null,
        };
      }

      return {
        latestVersion: latestTag.version,
        releaseUrl: this.buildDockerHubTagsUrl(source.image, latestTag.tag),
        sourceStatus: 'ok',
        error: null,
      };
    } catch (err) {
      this.logger.warn(
        `Docker Hub tags API failed for ${source.reference}: ${err}`,
      );

      return {
        latestVersion: null,
        releaseUrl: null,
        sourceStatus: 'degraded',
        error: VERSION_CHECK_ERROR,
      };
    }
  }

  private isValidGitHubRepo(repo: string): boolean {
    return GITHUB_REPO_PATTERN.test(repo);
  }

  private cleanVersion(version: string): string {
    return version.replace(/^v/, '');
  }

  private parseDockerHubImageRef(
    image?: string | null,
  ): DockerHubImageRef | null {
    if (!image) {
      return null;
    }

    const trimmedImage = image.trim();

    if (!trimmedImage) {
      return null;
    }

    const imageWithoutDigest = trimmedImage.split('@', 1)[0];
    const lastSlashIndex = imageWithoutDigest.lastIndexOf('/');
    const lastColonIndex = imageWithoutDigest.lastIndexOf(':');
    let imageName = imageWithoutDigest;
    let tag: string | null = null;

    if (lastColonIndex > lastSlashIndex) {
      tag = imageWithoutDigest.slice(lastColonIndex + 1) || null;
      imageName = imageWithoutDigest.slice(0, lastColonIndex);
    }

    const segments = imageName.split('/');
    let namespace: string;
    let repository: string;

    if (segments.length === 2) {
      [namespace, repository] = segments;
    } else if (segments.length === 3 && DOCKER_HUB_HOSTS.has(segments[0])) {
      [, namespace, repository] = segments;
    } else {
      return null;
    }

    if (
      !DOCKER_REPOSITORY_PART_PATTERN.test(namespace) ||
      !DOCKER_REPOSITORY_PART_PATTERN.test(repository)
    ) {
      return null;
    }

    return { namespace, repository, tag };
  }

  private buildGitHubReleaseUrl(repo: string, tag: string): string {
    return `${GITHUB_WEB_BASE}/${repo}/releases/tag/${encodeURIComponent(tag)}`;
  }

  private buildGitHubReleasesUrl(repo: string): string {
    return `${GITHUB_WEB_BASE}/${repo}/releases`;
  }

  private buildDockerHubTagsUrl(
    image: DockerHubImageRef,
    tag?: string,
  ): string {
    const baseUrl = `${DOCKER_HUB_WEB_BASE}/${image.namespace}/${image.repository}/tags`;

    if (!tag) {
      return baseUrl;
    }

    return `${baseUrl}?name=${encodeURIComponent(tag)}`;
  }

  /**
   * Fetch with a fixed timeout of 5 seconds via safeFetch (SSRF Protection)
   */
  private async fetchWithTimeout(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      const response = await safeFetch(
        url,
        {
          ...init,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Taskmaster-System',
            ...(init?.headers ?? {}),
          },
        },
        { timeoutMs: FETCH_TIMEOUT_MS, allowHttp: false },
      );

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }
      return response;
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message.includes('timeout')) {
        throw new Error('Request timed out');
      }
      throw err;
    }
  }

  private async fetchLatestRelease(
    repo: string,
  ): Promise<{ tag: string; version: string }> {
    const response = await this.fetchWithTimeout(
      `${GITHUB_API_BASE}/${repo}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub Releases API returned ${response.status}`);
    }

    const data = (await response.json()) as {
      tag_name: string;
      html_url: string;
    };

    return {
      tag: data.tag_name,
      version: this.cleanVersion(data.tag_name),
    };
  }

  private async fetchLatestDockerTag(
    image: DockerHubImageRef,
  ): Promise<{ tag: string; version: string } | null> {
    let bestMatch:
      | {
          tag: string;
          version: string;
          parsedVersion: string;
        }
      | null = null;

    for (let page = 1; page <= DOCKER_HUB_MAX_PAGES; page += 1) {
      const response = await this.fetchWithTimeout(
        `${DOCKER_HUB_API_BASE}/${image.namespace}/repositories/${image.repository}/tags?page=${page}&page_size=${DOCKER_HUB_PAGE_SIZE}`,
      );

      const data = (await response.json()) as {
        count?: number;
        results?: Array<{ name?: string }>;
      };
      const results = Array.isArray(data.results) ? data.results : [];

      for (const result of results) {
        if (!result.name) {
          continue;
        }

        const version = this.cleanVersion(result.name);
        const parsedVersion = semver.valid(version);

        if (!parsedVersion || semver.prerelease(parsedVersion)) {
          continue;
        }

        if (!bestMatch || semver.gt(parsedVersion, bestMatch.parsedVersion)) {
          bestMatch = {
            tag: result.name,
            version,
            parsedVersion,
          };
        }
      }

      if (results.length < DOCKER_HUB_PAGE_SIZE) {
        break;
      }

      if (
        typeof data.count === 'number' &&
        page * DOCKER_HUB_PAGE_SIZE >= data.count
      ) {
        break;
      }
    }

    if (!bestMatch) {
      return null;
    }

    return {
      tag: bestMatch.tag,
      version: bestMatch.version,
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
