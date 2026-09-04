export function formatPaise(amountPaise: bigint): string {
  const rupees = Number(amountPaise) / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rupees);
}

export function paiseToRupees(amountPaise: bigint): number {
  return Number(amountPaise) / 100;
}

export function rupeesToPaise(rupees: number): bigint {
  return BigInt(Math.round(rupees * 100));
}

export function zero(): bigint {
  return 0n;
}
