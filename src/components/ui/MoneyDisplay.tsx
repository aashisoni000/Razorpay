import { formatPaise } from "@/lib/utils/money";

interface MoneyDisplayProps {
  amountPaise: bigint;
  className?: string;
}

export function MoneyDisplay({ amountPaise, className }: MoneyDisplayProps) {
  return (
    <span className={className || "font-mono text-text-primary"}>
      {formatPaise(amountPaise)}
    </span>
  );
}
