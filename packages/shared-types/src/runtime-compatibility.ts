import { GielinorErrorException } from "./errors.js";

export const SUPPORTED_NODE_MAJORS = Object.freeze([22, 24] as const);
export const SUPPORTED_NODE_RANGE = "^22.0.0 || ^24.0.0";

export type NodeCompatibility = {
  version: string;
  major?: number;
  supported: boolean;
  supportedRange: string;
};

export function nodeCompatibility(version: string): NodeCompatibility {
  const match = /^v?(\d+)(?:\.|$)/.exec(version.trim());
  const major = match === null ? undefined : Number(match[1]);
  return {
    version,
    ...(major === undefined || !Number.isSafeInteger(major) ? {} : { major }),
    supported:
      major !== undefined &&
      Number.isSafeInteger(major) &&
      SUPPORTED_NODE_MAJORS.includes(major as (typeof SUPPORTED_NODE_MAJORS)[number]),
    supportedRange: SUPPORTED_NODE_RANGE,
  };
}

export function assertSupportedNodeVersion(
  version: string = process.versions.node,
): NodeCompatibility {
  const compatibility = nodeCompatibility(version);
  if (!compatibility.supported) {
    throw new GielinorErrorException("GC-CFG-003", {
      message: `Unsupported Node.js runtime; detected ${version}`,
      userMessage: "Gielinor Companion requires a supported Node.js 22 or 24 LTS release.",
      source: "runtime-compatibility",
      operation: "validate-node-version",
      details: {
        detectedMajor: compatibility.major ?? "unparseable",
        supportedMajors: [...SUPPORTED_NODE_MAJORS],
      },
    });
  }
  return compatibility;
}
