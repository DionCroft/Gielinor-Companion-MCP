import type { ProviderCapability } from "./plugin.js";

export type CircuitBreakerState = "closed" | "open" | "half-open";

export type CircuitBreakerPolicy = {
  failureThreshold: number;
  cooldownMs: number;
  maximumCooldownMs: number;
};

export const DEFAULT_CIRCUIT_BREAKER_POLICY: Readonly<CircuitBreakerPolicy> = Object.freeze({
  failureThreshold: 3,
  cooldownMs: 30_000,
  maximumCooldownMs: 300_000,
});

export type CircuitBreakerSnapshot = {
  providerId: string;
  capability: ProviderCapability;
  state: CircuitBreakerState;
  failureCount: number;
  currentCooldownMs: number;
  halfOpenProbeInFlight: boolean;
  lastFailureAt?: string;
  nextProbeAt?: string;
};

export type CircuitPermit =
  | {
      allowed: true;
      state: "closed" | "half-open";
    }
  | {
      allowed: false;
      state: "open" | "half-open";
      nextProbeAt: number;
    };

type MutableCircuitBreaker = {
  providerId: string;
  capability: ProviderCapability;
  state: CircuitBreakerState;
  failureCount: number;
  currentCooldownMs: number;
  halfOpenProbeInFlight: boolean;
  lastFailureAt?: number;
  nextProbeAt?: number;
};

export type ProviderCircuitBreakerOptions = {
  policy?: Partial<CircuitBreakerPolicy>;
  now?: () => number;
};

function resolvePolicy(overrides: Partial<CircuitBreakerPolicy> = {}): CircuitBreakerPolicy {
  const policy = { ...DEFAULT_CIRCUIT_BREAKER_POLICY, ...overrides };
  if (
    !Number.isSafeInteger(policy.failureThreshold) ||
    policy.failureThreshold < 1 ||
    policy.failureThreshold > 100
  ) {
    throw new RangeError("Circuit-breaker failureThreshold must be between 1 and 100");
  }
  if (
    !Number.isFinite(policy.cooldownMs) ||
    policy.cooldownMs < 1 ||
    policy.cooldownMs > 86_400_000
  ) {
    throw new RangeError("Circuit-breaker cooldownMs must be between 1 and one day");
  }
  if (
    !Number.isFinite(policy.maximumCooldownMs) ||
    policy.maximumCooldownMs < policy.cooldownMs ||
    policy.maximumCooldownMs > 86_400_000
  ) {
    throw new RangeError(
      "Circuit-breaker maximumCooldownMs must be at least cooldownMs and at most one day",
    );
  }
  return policy;
}

export class ProviderCircuitBreakers {
  private readonly circuits = new Map<string, MutableCircuitBreaker>();
  private readonly policy: CircuitBreakerPolicy;
  private readonly now: () => number;

  public constructor(options: ProviderCircuitBreakerOptions = {}) {
    this.policy = resolvePolicy(options.policy);
    this.now = options.now ?? Date.now;
  }

  public track(providerId: string, capability: ProviderCapability): void {
    this.entry(providerId, capability);
  }

  public acquire(providerId: string, capability: ProviderCapability): CircuitPermit {
    const circuit = this.entry(providerId, capability);
    const now = this.now();
    if (circuit.state === "closed") {
      return { allowed: true, state: "closed" };
    }
    if (circuit.state === "open") {
      const nextProbeAt = circuit.nextProbeAt ?? now + circuit.currentCooldownMs;
      if (now < nextProbeAt) {
        return { allowed: false, state: "open", nextProbeAt };
      }
      circuit.state = "half-open";
      circuit.halfOpenProbeInFlight = true;
      return { allowed: true, state: "half-open" };
    }
    if (circuit.halfOpenProbeInFlight) {
      return {
        allowed: false,
        state: "half-open",
        nextProbeAt: circuit.nextProbeAt ?? now,
      };
    }
    circuit.halfOpenProbeInFlight = true;
    return { allowed: true, state: "half-open" };
  }

  public success(providerId: string, capability: ProviderCapability): void {
    const circuit = this.entry(providerId, capability);
    circuit.state = "closed";
    circuit.failureCount = 0;
    circuit.currentCooldownMs = this.policy.cooldownMs;
    circuit.halfOpenProbeInFlight = false;
    delete circuit.nextProbeAt;
  }

  public failure(providerId: string, capability: ProviderCapability): void {
    const circuit = this.entry(providerId, capability);
    const now = this.now();
    const failedProbe = circuit.state === "half-open";
    circuit.failureCount += 1;
    circuit.lastFailureAt = now;
    circuit.halfOpenProbeInFlight = false;
    if (failedProbe) {
      circuit.currentCooldownMs = Math.min(
        this.policy.maximumCooldownMs,
        circuit.currentCooldownMs * 2,
      );
    }
    if (failedProbe || circuit.failureCount >= this.policy.failureThreshold) {
      circuit.state = "open";
      circuit.nextProbeAt = now + circuit.currentCooldownMs;
    }
  }

  public reset(providerId?: string, capability?: ProviderCapability): number {
    let resetCount = 0;
    for (const [key, circuit] of this.circuits) {
      if (
        (providerId === undefined || circuit.providerId === providerId) &&
        (capability === undefined || circuit.capability === capability)
      ) {
        this.circuits.set(key, this.fresh(circuit.providerId, circuit.capability));
        resetCount += 1;
      }
    }
    return resetCount;
  }

  public snapshot(): CircuitBreakerSnapshot[] {
    return [...this.circuits.values()]
      .map((circuit) => ({
        providerId: circuit.providerId,
        capability: circuit.capability,
        state: circuit.state,
        failureCount: circuit.failureCount,
        currentCooldownMs: circuit.currentCooldownMs,
        halfOpenProbeInFlight: circuit.halfOpenProbeInFlight,
        ...(circuit.lastFailureAt === undefined
          ? {}
          : { lastFailureAt: new Date(circuit.lastFailureAt).toISOString() }),
        ...(circuit.nextProbeAt === undefined
          ? {}
          : { nextProbeAt: new Date(circuit.nextProbeAt).toISOString() }),
      }))
      .sort(
        (left, right) =>
          left.providerId.localeCompare(right.providerId) ||
          left.capability.localeCompare(right.capability),
      );
  }

  private fresh(providerId: string, capability: ProviderCapability): MutableCircuitBreaker {
    return {
      providerId,
      capability,
      state: "closed",
      failureCount: 0,
      currentCooldownMs: this.policy.cooldownMs,
      halfOpenProbeInFlight: false,
    };
  }

  private entry(providerId: string, capability: ProviderCapability): MutableCircuitBreaker {
    const key = `${providerId}:${capability}`;
    let circuit = this.circuits.get(key);
    if (circuit === undefined) {
      circuit = this.fresh(providerId, capability);
      this.circuits.set(key, circuit);
    }
    return circuit;
  }
}
