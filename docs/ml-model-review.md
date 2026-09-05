# Logistic Regression Model Review

## Implementation Location

`src/lib/ml/model.ts`

## Mathematical Review

### Sigmoid Function

```typescript
function sigmoid(z: number): number {
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}
```

**Correct.** The clipping at z > 20 and z < -20 prevents numerical overflow. The standard sigmoid is σ(z) = 1 / (1 + e^(-z)).

### Dot Product

```typescript
function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}
```

**Correct.** Standard dot product implementation.

### Prediction

```typescript
export function predictProbability(weights, features): number {
  const z = dot(weights.weights, features) + weights.bias;
  return sigmoid(z);
}
```

**Correct.** Standard logistic regression prediction: P(y=1|x) = σ(w·x + b).

### Training (Gradient Descent)

```typescript
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
```

**Correct.** This is batch gradient descent for logistic regression:

1. For each sample, compute prediction error: `error = ŷ - y`
2. Accumulate gradients: `∂L/∂w_j = Σ error * x_j`
3. Average over batch: `gradW[j] /= n`
4. Add L2 regularization: `gradW[j] += λ * w_j`
5. Update weights: `w_j -= lr * gradW[j]`

The bias update `bias -= lr * (gradB / n)` is correct (bias has no L2 term).

### Loss Function

The implied loss function is binary cross-entropy with L2 regularization:

```
L = -1/n * Σ [y*log(σ(w·x+b)) + (1-y)*log(1-σ(w·x+b))] + λ/2 * Σ w_j²
```

**Correct.** This is the standard loss for logistic regression.

### Initialization

```typescript
const weights = new Array(d).fill(0);
let bias = 0;
```

**Correct.** Zero initialization is fine for logistic regression (unlike neural networks where it can cause symmetry problems).

### Hyperparameters

Default values:
- `learningRate = 0.2`
- `iterations = 1000`
- `l2Lambda = 0.001`

**Reasonable.** These are standard starting points. The learning rate is conservative enough to avoid divergence. 1000 iterations is sufficient for convergence on small datasets. L2 regularization prevents overfitting.

## Potential Issues

### Issue 1: No Feature Scaling

The features have vastly different scales:
- `sameCustomer`: [0, 1]
- `amountRatio`: [0, 5]
- `amountDifferencePaise`: [0, 10,000,000]
- `numCandidates`: [1, 10]

Gradient descent converges faster with standardized features. Without scaling, features with large magnitudes dominate the gradient.

**Impact**: The model still learns, but may converge slower and weights may not be interpretable. For a 14-feature logistic regression on ~400 examples, this is acceptable.

**Recommendation for 100k dataset**: Add feature standardization (z-score normalization) before training.

### Issue 2: No Convergence Check

The training runs for a fixed number of iterations regardless of convergence. There is no early stopping or gradient norm check.

**Impact**: Wastes computation if the model converges early. Could under-train if 1000 iterations is insufficient.

**Recommendation for 100k dataset**: Add convergence check (stop when gradient norm < epsilon) or use validation loss for early stopping.

### Issue 3: Batch Gradient Descent

The implementation uses full batch gradient descent (computes gradients over all training samples before updating). For large datasets, this is slow.

**Impact**: Acceptable for ~400 examples. Would be slow for 100k+ examples.

**Recommendation for 100k dataset**: Switch to mini-batch gradient descent (e.g., batch size 128-256).

### Issue 4: No Class Weighting

The model treats positive and negative examples equally. If the dataset is imbalanced (e.g., 80% negatives), the model may be biased toward predicting negative.

**Impact**: Depends on dataset balance. The current synthetic dataset has roughly balanced classes.

**Recommendation for 100k dataset**: Add optional class weighting to handle imbalance.

## Verdict

The implementation is mathematically correct and suitable for a hackathon demo. The issues above are optimization opportunities, not bugs. For the 100k dataset, feature scaling and mini-batch training should be added.
