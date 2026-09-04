import { RecoveryPolicy } from "./types";

export const DEFAULT_POLICY: RecoveryPolicy = {
  maxAttempts: 3,
  recoveryWindowHours: 72,
  cooldownBetweenAttemptsHours: 24,
};

export function createPolicy(overrides: Partial<RecoveryPolicy>): RecoveryPolicy {
  return { ...DEFAULT_POLICY, ...overrides };
}
