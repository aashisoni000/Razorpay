export interface ModelWeights {
  weights: number[];
  bias: number;
  featureNames: string[];
  trainedAt: string;
  trainingSamples: number;
}

function sigmoid(z: number): number {
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

export function predictProbability(
  weights: ModelWeights,
  features: number[]
): number {
  const z = dot(weights.weights, features) + weights.bias;
  return sigmoid(z);
}

export function predictClass(
  weights: ModelWeights,
  features: number[],
  threshold: number = 0.5
): 0 | 1 {
  return predictProbability(weights, features) >= threshold ? 1 : 0;
}

export function trainLogisticRegression(
  trainX: number[][],
  trainY: number[],
  featureNames: string[],
  opts: {
    learningRate?: number;
    iterations?: number;
    l2Lambda?: number;
  } = {}
): ModelWeights {
  const lr = opts.learningRate ?? 0.2;
  const iterations = opts.iterations ?? 1000;
  const l2 = opts.l2Lambda ?? 0.001;
  const n = trainX.length;
  const d = trainX[0].length;

  const weights = new Array(d).fill(0);
  let bias = 0;

  for (let iter = 0; iter < iterations; iter++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;

    for (let i = 0; i < n; i++) {
      const prob = sigmoid(dot(weights, trainX[i]) + bias);
      const error = prob - trainY[i];

      for (let j = 0; j < d; j++) {
        gradW[j] += error * trainX[i][j];
      }
      gradB += error;
    }

    for (let j = 0; j < d; j++) {
      gradW[j] = gradW[j] / n + l2 * weights[j];
      weights[j] -= lr * gradW[j];
    }
    bias -= lr * (gradB / n);
  }

  return {
    weights: [...weights],
    bias,
    featureNames: [...featureNames],
    trainedAt: new Date().toISOString(),
    trainingSamples: n,
  };
}

export function serializeModel(weights: ModelWeights): string {
  return JSON.stringify(weights);
}

export function deserializeModel(json: string): ModelWeights {
  return JSON.parse(json);
}
