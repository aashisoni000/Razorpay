import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/recovery/create-link/route";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    obligation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    recoveryAction: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    paymentEvent: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/services/recovery-service", () => ({
  createRecoveryLink: vi.fn(),
}));

function makeRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/recovery/create-link", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/recovery/create-link", () => {
  describe("admin token protection", () => {
    it("allows request when no SETTLE_ADMIN_TOKEN is configured", async () => {
      delete process.env.SETTLE_ADMIN_TOKEN;
      const { createRecoveryLink } = await import("@/lib/services/recovery-service");
      vi.mocked(createRecoveryLink).mockResolvedValue({
        actionId: "act-1",
        paymentLinkUrl: "https://rzp.io/i/test",
        amountPaise: 500000n,
      });

      const request = makeRequest({ obligationId: "ob-1" });
      const response = await POST(request);

      expect(response.status).not.toBe(401);
    });

    it("allows request with correct Bearer token", async () => {
      process.env.SETTLE_ADMIN_TOKEN = "secret-token-123";
      const { createRecoveryLink } = await import("@/lib/services/recovery-service");
      vi.mocked(createRecoveryLink).mockResolvedValue({
        actionId: "act-2",
        paymentLinkUrl: "https://rzp.io/i/test2",
        amountPaise: 300000n,
      });

      const request = makeRequest(
        { obligationId: "ob-2" },
        { authorization: "Bearer secret-token-123" }
      );
      const response = await POST(request);

      expect(response.status).not.toBe(401);
    });

    it("rejects request with wrong Bearer token", async () => {
      process.env.SETTLE_ADMIN_TOKEN = "secret-token-123";

      const request = makeRequest(
        { obligationId: "ob-3" },
        { authorization: "Bearer wrong-token" }
      );
      const response = await POST(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe("Unauthorized");
    });

    it("rejects request with no Authorization header when token is set", async () => {
      process.env.SETTLE_ADMIN_TOKEN = "secret-token-123";

      const request = makeRequest({ obligationId: "ob-4" });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });
  });
});
