import { describe, it, expect } from "vitest";
import { formatPaise, paiseToRupees, rupeesToPaise, zero } from "@/lib/utils/money";

describe("money utilities", () => {
  describe("formatPaise", () => {
    it("formats zero", () => {
      expect(formatPaise(0n)).toBe("₹0");
    });

    it("formats small amounts", () => {
      expect(formatPaise(100n)).toBe("₹1");
      expect(formatPaise(5000n)).toBe("₹50");
    });

    it("formats large amounts", () => {
      expect(formatPaise(1000000n)).toBe("₹10,000");
      expect(formatPaise(10000000n)).toBe("₹1,00,000");
    });
  });

  describe("paiseToRupees", () => {
    it("converts correctly", () => {
      expect(paiseToRupees(0n)).toBe(0);
      expect(paiseToRupees(100n)).toBe(1);
      expect(paiseToRupees(1000000n)).toBe(10000);
    });
  });

  describe("rupeesToPaise", () => {
    it("converts correctly", () => {
      expect(rupeesToPaise(0)).toBe(0n);
      expect(rupeesToPaise(1)).toBe(100n);
      expect(rupeesToPaise(10000)).toBe(1000000n);
    });
  });

  describe("zero", () => {
    it("returns bigint zero", () => {
      expect(zero()).toBe(0n);
      expect(typeof zero()).toBe("bigint");
    });
  });
});
