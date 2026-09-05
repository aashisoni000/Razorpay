import { describe, it, expect } from "vitest";
import { trainLogisticRegression, predictProbability, predictClass } from "../../src/lib/ml/model";

describe("Logistic Regression model", () => {
  it("trains on simple linearly separable data", () => {
    const trainX = [
      [1, 0],
      [1, 0],
      [1, 0],
      [0, 1],
      [0, 1],
      [0, 1],
    ];
    const trainY = [1, 1, 1, 0, 0, 0];

    const model = trainLogisticRegression(trainX, trainY, ["a", "b"], {
      learningRate: 0.5,
      iterations: 100,
    });

    expect(model.weights.length).toBe(2);
    expect(model.featureNames).toEqual(["a", "b"]);
    expect(model.trainingSamples).toBe(6);
  });

  it("predicts higher probability for positive class", () => {
    const trainX = [
      [2, 0],
      [2, 0],
      [2, 0],
      [0, 2],
      [0, 2],
      [0, 2],
    ];
    const trainY = [1, 1, 1, 0, 0, 0];

    const model = trainLogisticRegression(trainX, trainY, ["a", "b"], {
      learningRate: 0.5,
      iterations: 200,
    });

    const posProb = predictProbability(model, [2, 0]);
    const negProb = predictProbability(model, [0, 2]);

    expect(posProb).toBeGreaterThan(0.7);
    expect(negProb).toBeLessThan(0.3);
  });

  it("predictClass returns correct class", () => {
    const trainX = [
      [3, 0],
      [3, 0],
      [3, 0],
      [0, 3],
      [0, 3],
      [0, 3],
    ];
    const trainY = [1, 1, 1, 0, 0, 0];

    const model = trainLogisticRegression(trainX, trainY, ["a", "b"], {
      learningRate: 0.5,
      iterations: 200,
    });

    expect(predictClass(model, [3, 0])).toBe(1);
    expect(predictClass(model, [0, 3])).toBe(0);
  });

  it("probability is between 0 and 1", () => {
    const trainX = [[1], [2], [3], [4], [5]];
    const trainY = [0, 0, 1, 1, 1];

    const model = trainLogisticRegression(trainX, trainY, ["x"]);

    for (let i = 0; i <= 10; i++) {
      const prob = predictProbability(model, [i]);
      expect(prob).toBeGreaterThanOrEqual(0);
      expect(prob).toBeLessThanOrEqual(1);
    }
  });
});
