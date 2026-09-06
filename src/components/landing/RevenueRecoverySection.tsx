"use client";

const pills = [
  {
    label: "Intelligent",
    color: "#c8d96c",
    className:
      "top-[30%] left-[10%] md:top-[30%] md:left-[15%] rotate-[-4deg]",
    animation: "float 6s ease-in-out infinite",
    animationDelay: "0s",
  },
  {
    label: "Automated",
    color: "#d6e58e",
    className:
      "top-[28%] right-[8%] md:top-[28%] md:right-[12%] rotate-[3deg]",
    animation: "float 7s ease-in-out infinite",
    animationDelay: "1.5s",
  },
  {
    label: "Precise",
    color: "#e8f0c4",
    className:
      "bottom-[30%] left-[5%] md:bottom-[28%] md:left-[10%] rotate-[5deg] translate-y-[60px]",
    animation: "float 5.5s ease-in-out infinite",
    animationDelay: "0.8s",
  },
  {
    label: "Human-aware",
    color: "#f0e0e0",
    className:
      "bottom-[28%] right-[5%] md:bottom-[28%] md:right-[10%] rotate-[-3deg] translate-y-[60px]",
    animation: "float 6.5s ease-in-out infinite",
    animationDelay: "2s",
  },
];

export function RevenueRecoverySection() {
  return (
    <section className="relative w-full py-28 md:py-40 overflow-hidden">
      <div className="relative max-w-5xl mx-auto px-8">
        {/* Floating pills */}
        {pills.map((pill) => (
          <span
            key={pill.label}
            className={`absolute z-10 px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium text-text-primary shadow-md ${pill.className}`}
            style={{
              backgroundColor: pill.color,
              animation: pill.animation,
              animationDelay: pill.animationDelay,
            }}
          >
            {pill.label}
          </span>
        ))}

        {/* Typography */}
        <div className="text-center">
          <p
            className="text-2xl sm:text-3xl md:text-4xl font-medium text-text-secondary leading-tight"
            style={{ letterSpacing: "-0.02em" }}
          >
            the smarter way to
          </p>
          <h2
            className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-bold text-text-primary leading-[0.95] -mt-2"
            style={{ letterSpacing: "-0.06em" }}
          >
            recover revenue.
          </h2>
        </div>
      </div>
    </section>
  );
}
