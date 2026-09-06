import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

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
    },
  },
}));

describe("POST /api/assistant/obligation", () => {
  describe("1. invalid obligation ID rejected", () => {
    it("rejects empty obligationId", async () => {
      process.env.OPENAI_API_KEY = "test-key";

      const { POST } = await import(
        "@/app/api/assistant/obligation/route"
      );

      const request = new NextRequest(
        "http://localhost/api/assistant/obligation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ obligationId: "" }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.success).toBe(false);
    });

    it("rejects non-string obligationId", async () => {
      process.env.OPENAI_API_KEY = "test-key";

      const { POST } = await import(
        "@/app/api/assistant/obligation/route"
      );

      const request = new NextRequest(
        "http://localhost/api/assistant/obligation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ obligationId: 123 }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("rejects missing obligationId", async () => {
      process.env.OPENAI_API_KEY = "test-key";

      const { POST } = await import(
        "@/app/api/assistant/obligation/route"
      );

      const request = new NextRequest(
        "http://localhost/api/assistant/obligation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe("2. missing obligation returns appropriate error", () => {
    it("returns 404 for non-existent obligation", async () => {
      process.env.OPENAI_API_KEY = "test-key";

      const { prisma } = await import("@/lib/db");
      vi.mocked(prisma.obligation.findUnique).mockResolvedValue(null);

      const { POST } = await import(
        "@/app/api/assistant/obligation/route"
      );

      const request = new NextRequest(
        "http://localhost/api/assistant/obligation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ obligationId: "non-existent" }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("not found");
    });
  });

  describe("3. missing provider configuration handled gracefully", () => {
    it("returns 503 when no AI provider is configured", async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const { POST } = await import(
        "@/app/api/assistant/obligation/route"
      );

      const request = new NextRequest(
        "http://localhost/api/assistant/obligation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ obligationId: "ob-1" }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(503);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("unavailable");
      expect(body.error).toContain("configure");
    });
  });

  describe("4. structured obligation context contains only required facts", () => {
    it("context does not contain customer behavior predictions", async () => {
      process.env.OPENAI_API_KEY = "test-key";

      const { prisma } = await import("@/lib/db");
      vi.mocked(prisma.obligation.findUnique).mockResolvedValue({
        id: "ob-1",
        originalAmountPaise: 1000000n,
        recoveredAmountPaise: 600000n,
        refundedAmountPaise: 0n,
        outstandingAmountPaise: 400000n,
        excessAmountPaise: 0n,
        status: "OPEN",
        sourceReference: "ORD-1001",
        customer: { name: "Test Customer" },
        auditEntries: [],
        recoveryActions: [],
        exceptions: [],
        paymentEvents: [],
      } as never);

      const { POST } = await import(
        "@/app/api/assistant/obligation/route"
      );

      const request = new NextRequest(
        "http://localhost/api/assistant/obligation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ obligationId: "ob-1" }),
        }
      );

      const response = await POST(request);
      const body = await response.json();

      if (body.success) {
        expect(body.data.explanation).not.toContain("customer will");
        expect(body.data.explanation).not.toContain("likely to");
        expect(body.data.explanation).not.toContain("probability");
      }
    });
  });

  describe("5. assistant does not mutate obligation state", () => {
    it("findUnique is read-only, no update called", async () => {
      process.env.OPENAI_API_KEY = "test-key";

      const { prisma } = await import("@/lib/db");
      const findUniqueMock = vi.mocked(prisma.obligation.findUnique);
      findUniqueMock.mockResolvedValue({
        id: "ob-1",
        originalAmountPaise: 1000000n,
        recoveredAmountPaise: 0n,
        refundedAmountPaise: 0n,
        outstandingAmountPaise: 1000000n,
        excessAmountPaise: 0n,
        status: "OPEN",
        sourceReference: "ORD-1001",
        customer: { name: "Test Customer" },
        auditEntries: [],
        recoveryActions: [],
        exceptions: [],
        paymentEvents: [],
      } as never);

      const { POST } = await import(
        "@/app/api/assistant/obligation/route"
      );

      const request = new NextRequest(
        "http://localhost/api/assistant/obligation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ obligationId: "ob-1" }),
        }
      );

      await POST(request);

      expect(findUniqueMock).toHaveBeenCalled();
      expect(prisma.obligation.update).toBeUndefined();
      expect(prisma.obligation.updateMany).toBeUndefined();
      expect(prisma.obligation.create).toBeUndefined();
      expect(prisma.obligation.delete).toBeUndefined();
    });
  });

  describe("6. assistant does not create RecoveryAction", () => {
    it("no recovery action creation in assistant path", async () => {
      process.env.OPENAI_API_KEY = "test-key";

      const { prisma } = await import("@/lib/db");
      vi.mocked(prisma.obligation.findUnique).mockResolvedValue({
        id: "ob-1",
        originalAmountPaise: 1000000n,
        recoveredAmountPaise: 0n,
        refundedAmountPaise: 0n,
        outstandingAmountPaise: 1000000n,
        excessAmountPaise: 0n,
        status: "OPEN",
        sourceReference: "ORD-1001",
        customer: { name: "Test Customer" },
        auditEntries: [],
        recoveryActions: [],
        exceptions: [],
        paymentEvents: [],
      } as never);

      const { POST } = await import(
        "@/app/api/assistant/obligation/route"
      );

      const request = new NextRequest(
        "http://localhost/api/assistant/obligation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ obligationId: "ob-1" }),
        }
      );

      await POST(request);

      expect(prisma.recoveryAction).toBeUndefined();
    });
  });

  describe("7. assistant does not call Razorpay", () => {
    it("assistant-service exports only read-only functions", async () => {
      const assistantModule = await import(
        "@/lib/services/assistant-service"
      );

      const exports = Object.keys(assistantModule);
      expect(exports).toContain("explainObligation");
      expect(exports).toContain("getAssistantStatus");

      expect(exports).not.toContain("createPaymentLink");
      expect(exports).not.toContain("cancelPaymentLink");
      expect(exports).not.toContain("fetchPaymentLink");
    });
  });

  describe("8. assistant has no mutation tools", () => {
    it("assistant-service exports only read-only functions", async () => {
      const assistantModule = await import(
        "@/lib/services/assistant-service"
      );

      const exports = Object.keys(assistantModule);
      expect(exports).toContain("explainObligation");
      expect(exports).toContain("getAssistantStatus");

      expect(exports).not.toContain("createRecoveryAction");
      expect(exports).not.toContain("refundPayment");
      expect(exports).not.toContain("cancelAction");
      expect(exports).not.toContain("updateObligation");
    });
  });

  describe("9. provider failure handled gracefully", () => {
    it("returns 502 when provider API fails", async () => {
      process.env.OPENAI_API_KEY = "test-key";

      const { prisma } = await import("@/lib/db");
      vi.mocked(prisma.obligation.findUnique).mockResolvedValue({
        id: "ob-1",
        originalAmountPaise: 1000000n,
        recoveredAmountPaise: 0n,
        refundedAmountPaise: 0n,
        outstandingAmountPaise: 1000000n,
        excessAmountPaise: 0n,
        status: "OPEN",
        sourceReference: "ORD-1001",
        customer: { name: "Test Customer" },
        auditEntries: [],
        recoveryActions: [],
        exceptions: [],
        paymentEvents: [],
      } as never);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: { message: "Rate limited" } }),
      } as never);

      try {
        const { POST } = await import(
          "@/app/api/assistant/obligation/route"
        );

        const request = new NextRequest(
          "http://localhost/api/assistant/obligation",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ obligationId: "ob-1" }),
          }
        );

        const response = await POST(request);
        expect(response.status).toBe(502);

        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain("Provider error");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("11. API key is never included in response", () => {
    it("does not expose OpenAI API key", async () => {
      process.env.OPENAI_API_KEY = "sk-secret-key-12345";

      const { prisma } = await import("@/lib/db");
      vi.mocked(prisma.obligation.findUnique).mockResolvedValue(null);

      const { POST } = await import(
        "@/app/api/assistant/obligation/route"
      );

      const request = new NextRequest(
        "http://localhost/api/assistant/obligation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ obligationId: "non-existent" }),
        }
      );

      const response = await POST(request);
      const body = await response.json();
      const responseText = JSON.stringify(body);

      expect(responseText).not.toContain("sk-secret-key-12345");
    });

    it("does not expose Anthropic API key", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-secret";

      const { prisma } = await import("@/lib/db");
      vi.mocked(prisma.obligation.findUnique).mockResolvedValue(null);

      const { POST } = await import(
        "@/app/api/assistant/obligation/route"
      );

      const request = new NextRequest(
        "http://localhost/api/assistant/obligation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ obligationId: "non-existent" }),
        }
      );

      const response = await POST(request);
      const body = await response.json();
      const responseText = JSON.stringify(body);

      expect(responseText).not.toContain("sk-ant-secret");
    });

    it("does not expose Razorpay webhook secret", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_secret123";

      const { prisma } = await import("@/lib/db");
      vi.mocked(prisma.obligation.findUnique).mockResolvedValue(null);

      const { POST } = await import(
        "@/app/api/assistant/obligation/route"
      );

      const request = new NextRequest(
        "http://localhost/api/assistant/obligation",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ obligationId: "non-existent" }),
        }
      );

      const response = await POST(request);
      const body = await response.json();
      const responseText = JSON.stringify(body);

      expect(responseText).not.toContain("whsec_secret123");
    });
  });

  describe("12. raw Razorpay webhook payload is not included in assistant context", () => {
    it("context builder does not include rawPayload field", async () => {
      process.env.OPENAI_API_KEY = "test-key";

      const { prisma } = await import("@/lib/db");
      vi.mocked(prisma.obligation.findUnique).mockResolvedValue({
        id: "ob-1",
        originalAmountPaise: 1000000n,
        recoveredAmountPaise: 0n,
        refundedAmountPaise: 0n,
        outstandingAmountPaise: 1000000n,
        excessAmountPaise: 0n,
        status: "OPEN",
        sourceReference: "ORD-1001",
        customer: { name: "Test Customer" },
        auditEntries: [],
        recoveryActions: [],
        exceptions: [],
        paymentEvents: [],
      } as never);

      const originalFetch = globalThis.fetch;
      let capturedBody = "";
      globalThis.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBody = init.body as string;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [{ message: { content: "Test explanation" } }],
            }),
        } as never);
      });

      try {
        const { POST } = await import(
          "@/app/api/assistant/obligation/route"
        );

        const request = new NextRequest(
          "http://localhost/api/assistant/obligation",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ obligationId: "ob-1" }),
          }
        );

        await POST(request);

        expect(capturedBody).not.toContain("rawPayload");
        expect(capturedBody).not.toContain("webhook");
        expect(capturedBody).not.toContain("razorpay");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

describe("assistant-service", () => {
  describe("getAssistantStatus", () => {
    it("reports configured when OPENAI_API_KEY is set", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      delete process.env.ANTHROPIC_API_KEY;

      const { getAssistantStatus } = await import(
        "@/lib/services/assistant-service"
      );
      const status = getAssistantStatus();

      expect(status.configured).toBe(true);
      expect(status.provider).toBe("openai");
    });

    it("reports configured when ANTHROPIC_API_KEY is set", async () => {
      delete process.env.OPENAI_API_KEY;
      process.env.ANTHROPIC_API_KEY = "test-key";

      const { getAssistantStatus } = await import(
        "@/lib/services/assistant-service"
      );
      const status = getAssistantStatus();

      expect(status.configured).toBe(true);
      expect(status.provider).toBe("anthropic");
    });

    it("reports unconfigured when no keys are set", async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const { getAssistantStatus } = await import(
        "@/lib/services/assistant-service"
      );
      const status = getAssistantStatus();

      expect(status.configured).toBe(false);
      expect(status.provider).toBeNull();
    });
  });
});
