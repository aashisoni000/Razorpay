"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/" || pathname === "/login";

  if (isLanding) {
    return (
      <div className="flex-1 flex flex-col min-h-full">
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    );
  }

  return (
    <>
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-full grid-canvas">
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
    </>
  );
}
