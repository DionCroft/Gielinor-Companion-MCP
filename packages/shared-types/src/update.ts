import { z } from "zod";

import { GielinorErrorCodeSchema } from "./errors.js";

const isoDateTime = z.string().datetime({ offset: true });
const officialReleaseUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.pathname.startsWith("/DionCroft/Gielinor-Companion-MCP/releases/")
    );
  }, "Release URLs must use the official Gielinor Companion GitHub repository");

export const SoftwareUpdateStateSchema = z.enum([
  "up-to-date",
  "update-available",
  "pre-release-available",
  "unable-to-check",
  "offline",
  "invalid-release-metadata",
  "disabled",
]);
export type SoftwareUpdateState = z.infer<typeof SoftwareUpdateStateSchema>;

export const SoftwareReleaseAssetSchema = z
  .object({
    name: z.string().min(1).max(500),
    contentType: z.string().min(1).max(200),
    size: z.number().int().nonnegative(),
    downloadUrl: officialReleaseUrl,
    digest: z.string().min(1).max(300).optional(),
  })
  .strict();
export type SoftwareReleaseAsset = z.infer<typeof SoftwareReleaseAssetSchema>;

export const SoftwareReleaseSchema = z
  .object({
    version: z.string().min(1).max(100),
    tagName: z.string().min(1).max(100),
    name: z.string().min(1).max(500),
    notes: z.string().max(100_000),
    publishedAt: isoDateTime,
    releaseUrl: officialReleaseUrl,
    prerelease: z.boolean(),
    assets: z.array(SoftwareReleaseAssetSchema).max(100),
  })
  .strict();
export type SoftwareRelease = z.infer<typeof SoftwareReleaseSchema>;

export const SoftwareUpdateCheckSchema = z
  .object({
    state: SoftwareUpdateStateSchema,
    installedVersion: z.string().min(1).max(100),
    checkedAt: isoDateTime,
    nextCheckAt: isoDateTime.optional(),
    source: z.enum(["live", "cache", "none"]),
    message: z.string().min(1).max(500),
    release: SoftwareReleaseSchema.optional(),
    errorCode: GielinorErrorCodeSchema.optional(),
    warnings: z.array(GielinorErrorCodeSchema).max(10),
    traceId: z.string().uuid(),
  })
  .strict();
export type SoftwareUpdateCheck = z.infer<typeof SoftwareUpdateCheckSchema>;
