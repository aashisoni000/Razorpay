import { describe, it, expect } from "vitest";
import { generateDataset, splitDataset } from "../../src/lib/ml/dataset";

describe("Dataset generation", () => {
  it("generates dataset with correct structure", () => {
    const dataset = generateDataset(42);
    expect(dataset.length).toBeGreaterThan(0);

    for (const row of dataset) {
      expect(row.features.length).toBe(14);
      expect(row.label === 0 || row.label === 1).toBe(true);
      expect(typeof row.paymentId).toBe("string");
      expect(typeof row.candidateId).toBe("string");
      expect(typeof row.source).toBe("string");
    }
  });

  it("generates dataset with both positive and negative examples", () => {
    const dataset = generateDataset(42);
    const positives = dataset.filter((r) => r.label === 1);
    const negatives = dataset.filter((r) => r.label === 0);

    expect(positives.length).toBeGreaterThan(0);
    expect(negatives.length).toBeGreaterThan(0);
  });

  it("generates reproducible dataset with same seed", () => {
    const d1 = generateDataset(42);
    const d2 = generateDataset(42);
    expect(d1).toEqual(d2);
  });

  it("generates different dataset with different seed", () => {
    const d1 = generateDataset(42);
    const d2 = generateDataset(99);
    expect(d1).not.toEqual(d2);
  });
});

describe("Dataset splitting", () => {
  it("splits dataset into train and test", () => {
    const dataset = generateDataset(42);
    const { train, test } = splitDataset(dataset, 0.8, 42);

    expect(train.length + test.length).toBe(dataset.length);
    expect(train.length).toBeGreaterThan(0);
    expect(test.length).toBeGreaterThan(0);
  });

  it("train/test split is approximately 80/20", () => {
    const dataset = generateDataset(42);
    const { train } = splitDataset(dataset, 0.8, 42);

    const trainRatio = train.length / dataset.length;
    expect(trainRatio).toBeGreaterThan(0.7);
    expect(trainRatio).toBeLessThan(0.9);
  });

  it("split is reproducible", () => {
    const dataset = generateDataset(42);
    const s1 = splitDataset(dataset, 0.8, 42);
    const s2 = splitDataset(dataset, 0.8, 42);

    expect(s1.train.length).toBe(s2.train.length);
    expect(s1.test.length).toBe(s2.test.length);
  });
});
