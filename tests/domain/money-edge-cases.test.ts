import { describe, it, expect } from "vitest";
import { formatPaise } from "@/lib/utils/money";

describe("money formatting edge cases", () => {
  it("handles 1 paise", () => {
    expect(formatPaise(1n)).toBe("₹0");
  });

  it("handles amounts with paise", () => {
    expect(formatPaise(150n)).toBe("₹2");
  });

  it("handles exactly ₹1", () => {
    expect(formatPaise(100n)).toBe("₹1");
  });

  it("handles ₹10,000", () => {
    expect(formatPaise(1000000n)).toBe("₹10,000");
  });

  it("handles ₹1,00,000", () => {
    expect(formatPaise(10000000n)).toBe("₹1,00,000");
  });
});
