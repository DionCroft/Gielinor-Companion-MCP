import {
  SoftwareReleaseSchema,
  SoftwareUpdateCheckSchema,
  createTraceId,
  parseRetryAfter,
  type ComponentHealth,
  type GielinorErrorCode,
  type SoftwareRelease,
  type SoftwareUpdateCheck,
} from "@gielinor/shared-types";
import type { CacheEntry, CacheStore } from "@gielinor/providers";
import { z } from "zod";

const RELEASES_API =
  "https://api.github.com/repos/DionCroft/Gielinor-Companion-MCP/releases?per_page=20";
const CACHE_KEY = "software-update:github-releases:v1";
const DEFAULT_CHECK_INTERVAL_MS = 24 * 60 * 60_000;

const OfficialReleaseUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.pathname.startsWith("/DionCroft/Gielinor-Companion-MCP/releases/")
    );
  }, "Release links must use the official GitHub repository");

const GithubAssetSchema = z
  .object({
    name: z.string().min(1).max(500),
    content_type: z.string().min(1).max(200),
    size: z.number().int().nonnegative(),
    browser_download_url: OfficialReleaseUrlSchema,
    digest: z.string().min(1).max(300).nullable().optional(),
  })
  .passthrough();

const GithubReleaseSchema = z
  .object({
    tag_name: z.string().min(1).max(100),
    name: z.string().max(500).nullable(),
    body: z.string().max(100_000).nullable(),
    draft: z.boolean(),
    prerelease: z.boolean(),
    published_at: z.string().datetime({ offset: true }).nullable(),
    html_url: OfficialReleaseUrlSchema,
    assets: z.array(GithubAssetSchema).max(100),
  })
  .passthrough();

const GithubReleasesSchema = z.array(GithubReleaseSchema).max(100);

type GithubRelease = z.infer<typeof GithubReleaseSchema>;

type SemanticVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<string | number>;
  canonical: string;
};

type UpdateCacheValue = {
  releases: SoftwareRelease[];
};

const UpdateCacheValueSchema = z
  .object({
    releases: z.array(SoftwareReleaseSchema).max(100),
  })
  .strict();

type UpdateRequestError = Error & {
  status?: number;
  retryAfterMs?: number;
  code?: GielinorErrorCode;
};

export type SoftwareUpdateServiceOptions = {
  installedVersion: string;
  cacheStore: CacheStore;
  userAgent: string;
  offline?: boolean | (() => boolean) | undefined;
  enabled?: boolean | undefined;
  apiUrl?: string | undefined;
  checkIntervalMs?: number | undefined;
  timeoutMs?: number | undefined;
  maximumAttempts?: number | undefined;
  fetchImplementation?: typeof fetch | undefined;
  now?: (() => number) | undefined;
  sleep?: ((milliseconds: number) => Promise<void>) | undefined;
};

export type SoftwareUpdateCheckOptions = {
  includePrereleases?: boolean | undefined;
  forceRefresh?: boolean | undefined;
};

export function softwareUpdateChecksEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  const value = environment.GIELINOR_UPDATE_CHECKS_ENABLED;
  if (value === undefined) {
    return true;
  }
  return z
    .enum(["true", "false", "1", "0", "yes", "no", "on", "off"])
    .transform((entry) => ["true", "1", "yes", "on"].includes(entry))
    .parse(value.trim().toLowerCase());
}

function parseSemanticVersion(value: string): SemanticVersion | undefined {
  const match =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      value.trim(),
    );
  if (match === null) {
    return undefined;
  }
  const prerelease =
    match[4] === undefined
      ? []
      : match[4].split(".").map((identifier) => {
          if (/^(?:0|[1-9]\d*)$/.test(identifier)) {
            return Number(identifier);
          }
          return identifier;
        });
  if (
    prerelease.some(
      (identifier) => typeof identifier === "number" && !Number.isSafeInteger(identifier),
    )
  ) {
    return undefined;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    return undefined;
  }
  return {
    major,
    minor,
    patch,
    prerelease,
    canonical: `${major}.${minor}.${patch}${
      prerelease.length === 0 ? "" : `-${prerelease.join(".")}`
    }`,
  };
}

function compareSemanticVersions(left: SemanticVersion, right: SemanticVersion): number {
  for (const key of ["major", "minor", "patch"] as const) {
    const difference = left[key] - right[key];
    if (difference !== 0) {
      return Math.sign(difference);
    }
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return left.prerelease.length === right.prerelease.length
      ? 0
      : left.prerelease.length === 0
        ? 1
        : -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined || rightPart === undefined) {
      return leftPart === rightPart ? 0 : leftPart === undefined ? -1 : 1;
    }
    if (leftPart === rightPart) {
      continue;
    }
    if (typeof leftPart === "number" && typeof rightPart === "number") {
      return leftPart < rightPart ? -1 : 1;
    }
    if (typeof leftPart === "number") {
      return -1;
    }
    if (typeof rightPart === "number") {
      return 1;
    }
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

function mapRelease(release: GithubRelease): SoftwareRelease | undefined {
  if (release.draft || release.published_at === null) {
    return undefined;
  }
  const version = parseSemanticVersion(release.tag_name);
  if (version === undefined) {
    return undefined;
  }
  return SoftwareReleaseSchema.parse({
    version: version.canonical,
    tagName: release.tag_name,
    name: release.name?.trim() || release.tag_name,
    notes: release.body ?? "",
    publishedAt: release.published_at,
    releaseUrl: release.html_url,
    prerelease: release.prerelease,
    assets: release.assets.map((asset) => ({
      name: asset.name,
      contentType: asset.content_type,
      size: asset.size,
      downloadUrl: asset.browser_download_url,
      ...(asset.digest === null || asset.digest === undefined ? {} : { digest: asset.digest }),
    })),
  });
}

function latestRelease(
  releases: SoftwareRelease[],
  includePrereleases: boolean,
): SoftwareRelease | undefined {
  return releases
    .filter((release) => includePrereleases || !release.prerelease)
    .map((release) => ({ release, version: parseSemanticVersion(release.version) }))
    .filter(
      (
        candidate,
      ): candidate is {
        release: SoftwareRelease;
        version: SemanticVersion;
      } => candidate.version !== undefined,
    )
    .sort((left, right) => compareSemanticVersions(right.version, left.version))[0]?.release;
}

function failureCode(error: unknown): GielinorErrorCode {
  if (typeof error === "object" && error !== null) {
    const code = Reflect.get(error, "code");
    if (code === "GC-UPDATE-005" || code === "GC-UPDATE-003") {
      return code;
    }
  }
  return "GC-UPDATE-001";
}

export class SoftwareUpdateService {
  public readonly enabled: boolean;
  private readonly installedVersion: SemanticVersion;
  private readonly fetchImplementation: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly intervalMs: number;
  private readonly timeoutMs: number;
  private readonly maximumAttempts: number;
  private readonly apiUrl: string;

  public constructor(private readonly options: SoftwareUpdateServiceOptions) {
    const installedVersion = parseSemanticVersion(options.installedVersion);
    if (installedVersion === undefined) {
      throw new TypeError("Installed application version must be valid semantic version");
    }
    this.installedVersion = installedVersion;
    this.enabled = options.enabled ?? true;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds)));
    this.intervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maximumAttempts = options.maximumAttempts ?? 2;
    this.apiUrl = options.apiUrl ?? RELEASES_API;
    if (
      !Number.isSafeInteger(this.intervalMs) ||
      this.intervalMs < 60_000 ||
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs < 100 ||
      !Number.isSafeInteger(this.maximumAttempts) ||
      this.maximumAttempts < 1 ||
      this.maximumAttempts > 3
    ) {
      throw new RangeError("Software update timing configuration is invalid");
    }
  }

  public async check(options: SoftwareUpdateCheckOptions = {}): Promise<SoftwareUpdateCheck> {
    const checkedAtMs = this.now();
    const traceId = createTraceId();
    const cached = await this.readCache();
    if (!this.enabled) {
      return this.result("disabled", "Software update checks are disabled", traceId, "none");
    }
    if (this.isOffline()) {
      return this.offlineResult(cached, options.includePrereleases ?? false, traceId);
    }
    if (
      !(options.forceRefresh ?? false) &&
      cached !== null &&
      cached.entry.freshUntil > checkedAtMs
    ) {
      return this.evaluate(
        cached.value.releases,
        options.includePrereleases ?? false,
        traceId,
        "cache",
      );
    }

    try {
      const releases = await this.fetchReleases();
      const now = this.now();
      await this.options.cacheStore.set(CACHE_KEY, {
        metadataVersion: 1,
        value: { releases },
        provider: "GitHub Releases API",
        fetchedAt: now,
        storedAt: now,
        freshUntil: now + this.intervalMs,
        staleUntil: now + 30 * 24 * 60 * 60_000,
        lastSuccessfulRefreshAt: now,
      });
      return this.evaluate(releases, options.includePrereleases ?? false, traceId, "live");
    } catch (error) {
      const code = failureCode(error);
      await this.options.cacheStore.recordRefreshFailure(CACHE_KEY, {
        failedAt: this.now(),
        code,
        traceId,
      });
      if (cached !== null && code !== "GC-UPDATE-003") {
        const fallback = this.evaluate(
          cached.value.releases,
          options.includePrereleases ?? false,
          traceId,
          "cache",
        );
        return SoftwareUpdateCheckSchema.parse({
          ...fallback,
          message: `${fallback.message}; cached metadata was used because the live check failed`,
          errorCode: code,
        });
      }
      return this.result(
        code === "GC-UPDATE-003" ? "invalid-release-metadata" : "unable-to-check",
        code === "GC-UPDATE-005"
          ? "GitHub temporarily rate limited the update check"
          : code === "GC-UPDATE-003"
            ? "GitHub returned invalid release metadata"
            : "The latest release could not be checked",
        traceId,
        "none",
        code,
      );
    }
  }

  public async getHealth(): Promise<ComponentHealth> {
    const checkedAt = new Date(this.now()).toISOString();
    if (!this.enabled) {
      return {
        id: "update-checker",
        state: "disabled",
        message: "Read-only software update checks are disabled",
        checkedAt,
      };
    }
    if (this.isOffline()) {
      return {
        id: "update-checker",
        state: "offline",
        message: "Software update checks are paused in offline mode",
        checkedAt,
      };
    }
    const cached = await this.readCache();
    if (cached === null) {
      return {
        id: "update-checker",
        state: "unknown",
        message: "No validated software update check has completed yet",
        checkedAt,
      };
    }
    const stale = cached.entry.freshUntil <= this.now();
    return {
      id: "update-checker",
      state: stale ? "degraded" : "healthy",
      message: stale
        ? "Cached software release metadata is due for refresh"
        : "Validated software release metadata is cached",
      checkedAt,
      lastSuccessAt: new Date(cached.entry.lastSuccessfulRefreshAt).toISOString(),
      ...(cached.entry.lastFailedRefreshAt === undefined
        ? {}
        : { lastFailureAt: new Date(cached.entry.lastFailedRefreshAt).toISOString() }),
      ...(cached.entry.lastFailureCode === undefined
        ? {}
        : { errorCode: cached.entry.lastFailureCode }),
    };
  }

  private result(
    state: SoftwareUpdateCheck["state"],
    message: string,
    traceId: string,
    source: SoftwareUpdateCheck["source"],
    errorCode?: GielinorErrorCode,
    release?: SoftwareRelease,
  ): SoftwareUpdateCheck {
    return SoftwareUpdateCheckSchema.parse({
      state,
      installedVersion: this.installedVersion.canonical,
      checkedAt: new Date(this.now()).toISOString(),
      nextCheckAt: new Date(this.now() + this.intervalMs).toISOString(),
      source,
      message,
      warnings:
        release !== undefined && release.assets.some((asset) => asset.digest === undefined)
          ? ["GC-UPDATE-004"]
          : [],
      traceId,
      ...(release === undefined ? {} : { release }),
      ...(errorCode === undefined ? {} : { errorCode }),
    });
  }

  private evaluate(
    releases: SoftwareRelease[],
    includePrereleases: boolean,
    traceId: string,
    source: "live" | "cache",
  ): SoftwareUpdateCheck {
    const release = latestRelease(releases, includePrereleases);
    if (release === undefined) {
      return this.result(
        "up-to-date",
        releases.length === 0
          ? "No published releases are available yet"
          : "No published release is available for the selected update channel",
        traceId,
        source,
      );
    }
    const releaseVersion = parseSemanticVersion(release.version);
    if (releaseVersion === undefined) {
      return this.result(
        "invalid-release-metadata",
        "The latest release version was invalid",
        traceId,
        source,
        "GC-UPDATE-003",
      );
    }
    const newer = compareSemanticVersions(releaseVersion, this.installedVersion) > 0;
    return this.result(
      newer ? (release.prerelease ? "pre-release-available" : "update-available") : "up-to-date",
      newer
        ? `${release.name} is available; download or installation requires an explicit user action`
        : `Version ${this.installedVersion.canonical} is up to date`,
      traceId,
      source,
      newer ? "GC-UPDATE-002" : undefined,
      release,
    );
  }

  private offlineResult(
    cached: { entry: CacheEntry<UpdateCacheValue>; value: UpdateCacheValue } | null,
    includePrereleases: boolean,
    traceId: string,
  ): SoftwareUpdateCheck {
    const release =
      cached === null ? undefined : latestRelease(cached.value.releases, includePrereleases);
    return this.result(
      "offline",
      release === undefined
        ? "Update checking is offline and no cached release metadata is available"
        : "Update checking is offline; cached release metadata is available",
      traceId,
      release === undefined ? "none" : "cache",
      undefined,
      release,
    );
  }

  private async readCache(): Promise<{
    entry: CacheEntry<UpdateCacheValue>;
    value: UpdateCacheValue;
  } | null> {
    const entry = await this.options.cacheStore.get<UpdateCacheValue>(CACHE_KEY);
    if (entry === null) {
      return null;
    }
    const parsed = UpdateCacheValueSchema.safeParse(entry.value);
    if (parsed.success) {
      return { entry, value: parsed.data };
    }
    await this.options.cacheStore.quarantine(
      CACHE_KEY,
      entry,
      {
        quarantineId: createTraceId(),
        provider: "GitHub Releases API",
        quarantinedAt: this.now(),
        storedAt: entry.storedAt,
        errorCode: "GC-CACHE-005",
        reason: "Cached software release metadata failed validation",
        sample: { payload: "[invalid-update-metadata]" },
      },
      true,
    );
    return null;
  }

  private async fetchReleases(): Promise<SoftwareRelease[]> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maximumAttempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
        let response: Response;
        try {
          response = await this.fetchImplementation(this.apiUrl, {
            headers: {
              Accept: "application/vnd.github+json",
              "User-Agent": this.options.userAgent,
              "X-GitHub-Api-Version": "2022-11-28",
            },
            signal: controller.signal,
          });
        } finally {
          globalThis.clearTimeout(timeout);
        }
        if (!response.ok) {
          const rateLimited =
            response.status === 429 ||
            (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0");
          const error = new Error(
            rateLimited ? "GitHub update API rate limit reached" : "GitHub update API failed",
          ) as UpdateRequestError;
          error.status = response.status;
          error.code = rateLimited ? "GC-UPDATE-005" : "GC-UPDATE-001";
          const retryAfterMs = parseRetryAfter(
            response.headers.get("retry-after"),
            this.now(),
            60_000,
          );
          if (retryAfterMs !== undefined) {
            error.retryAfterMs = retryAfterMs;
          }
          await response.body?.cancel();
          throw error;
        }
        let payload: unknown;
        try {
          payload = await response.json();
        } catch (cause) {
          const error = new Error("GitHub release response was not valid JSON", {
            cause,
          }) as UpdateRequestError;
          error.code = "GC-UPDATE-003";
          throw error;
        }
        const parsed = GithubReleasesSchema.safeParse(payload);
        if (!parsed.success) {
          const error = new Error("GitHub release response did not match the documented schema", {
            cause: parsed.error,
          }) as UpdateRequestError;
          error.code = "GC-UPDATE-003";
          throw error;
        }
        const releases = parsed.data
          .map(mapRelease)
          .filter((release): release is SoftwareRelease => release !== undefined);
        if (releases.length === 0 && parsed.data.length > 0) {
          const error = new Error("GitHub returned no valid semantic-version releases");
          (error as UpdateRequestError).code = "GC-UPDATE-003";
          throw error;
        }
        return releases;
      } catch (error) {
        lastError = error;
        const code = failureCode(error);
        const status =
          typeof error === "object" && error !== null
            ? (Reflect.get(error, "status") as number | undefined)
            : undefined;
        const retryable =
          code !== "GC-UPDATE-003" &&
          (code === "GC-UPDATE-005" ||
            status === undefined ||
            status === 408 ||
            status === 425 ||
            status >= 500);
        if (!retryable || attempt === this.maximumAttempts) {
          throw error;
        }
        const retryAfter =
          typeof error === "object" && error !== null
            ? (Reflect.get(error, "retryAfterMs") as number | undefined)
            : undefined;
        await this.sleep(retryAfter ?? Math.min(2_000, 250 * 2 ** (attempt - 1)));
      }
    }
    throw lastError;
  }

  private isOffline(): boolean {
    return typeof this.options.offline === "function"
      ? this.options.offline()
      : (this.options.offline ?? false);
  }
}
