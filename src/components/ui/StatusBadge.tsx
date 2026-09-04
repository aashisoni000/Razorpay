interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-700 border-blue-200",
  PARTIALLY_RECOVERED: "bg-amber-50 text-amber-700 border-amber-200",
  RECOVERED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  OVERPAID: "bg-violet-50 text-violet-700 border-violet-200",
  STOPPED: "bg-gray-100 text-gray-600 border-gray-200",
  ESCALATED: "bg-red-50 text-red-700 border-red-200",
  CREATED: "bg-blue-50 text-blue-700 border-blue-200",
  ACTIVE: "bg-amber-50 text-amber-700 border-amber-200",
  SUCCEEDED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-gray-100 text-gray-600 border-gray-200",
  EXPIRED: "bg-gray-100 text-gray-600 border-gray-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DISMISSED: "bg-gray-100 text-gray-600 border-gray-200",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status] || "bg-gray-100 text-gray-600 border-gray-200";

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
