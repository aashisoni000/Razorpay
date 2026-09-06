import Link from "next/link";
import Image from "next/image";
import { RevenueRecoverySection } from "@/components/landing/RevenueRecoverySection";

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center min-h-screen">
      {/* Navbar */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-xl">
        <div className="flex items-center gap-3 bg-sidebar-bg rounded-full px-3 py-2 shadow-lg">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0 w-10 h-10 rounded-full bg-white flex items-center justify-center">
            <Image src="/logo.svg" alt="Settle" width={24} height={24} className="object-contain" />
          </Link>

          {/* Nav Links */}
          <div className="flex items-center gap-1 flex-1 justify-center">
            <a href="#" className="px-4 py-2 text-sm text-white/80 hover:text-white transition-colors rounded-full hover:bg-white/10 hidden sm:block">
              Overview
            </a>
            <a href="#hero" className="px-4 py-2 text-sm text-white/80 hover:text-white transition-colors rounded-full hover:bg-white/10 hidden sm:block">
              How it works
            </a>
            <a href="#hero" className="px-4 py-2 text-sm text-white/80 hover:text-white transition-colors rounded-full hover:bg-white/10 hidden sm:block">
              AI
            </a>
          </div>

          {/* CTA */}
          <Link
            href="/login"
            className="flex-shrink-0 px-6 py-2.5 rounded-full bg-white text-sidebar-bg text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            Try Settle
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div id="hero" className="flex items-end justify-center flex-1 w-full px-8 pb-12 pt-28">
        <div className="flex flex-col items-center gap-8">
          <h1
            className="text-6xl sm:text-7xl md:text-8xl font-bold text-text-primary text-center leading-tight"
            style={{ letterSpacing: "-0.06em" }}
          >
            Know. Recover. Settle.
          </h1>
          <Link
            href="/login"
            className="px-8 py-3.5 rounded-xl bg-sidebar-bg text-white text-sm font-semibold tracking-wide hover:bg-sidebar-bg/90 transition-all duration-200 hover:shadow-lg"
          >
            Try Settle
          </Link>
        </div>
      </div>

      {/* Illustration */}
      <div className="w-full mt-8">
        <Image
          src="/illustration.svg"
          alt="Settle"
          width={1920}
          height={600}
          className="w-full h-auto"
          priority
        />
      </div>

      {/* Revenue Recovery Section */}
      <RevenueRecoverySection />

      {/* Feature section */}
      <div className="w-full max-w-6xl mx-auto px-8 py-12 flex flex-col md:flex-row items-center gap-12 md:gap-16">
        <div className="w-full md:w-1/2">
          <Image
            src="/landing_2.svg"
            alt=""
            width={960}
            height={600}
            className="w-full h-auto"
          />
        </div>
        <div className="w-full md:w-1/2">
          <h2
            className="text-4xl sm:text-5xl font-bold text-text-primary leading-tight"
            style={{ letterSpacing: "-0.06em" }}
          >
            Put the pieces together.
          </h2>
          <p className="text-base text-text-secondary mt-5 leading-relaxed max-w-md">
            Settle connects every payment to the obligation behind it — so you recover what&apos;s owed, and nothing more.
          </p>
        </div>
      </div>

      {/* Feature section 3: Decisions you can trust */}
      <div className="w-full max-w-6xl mx-auto px-8 py-12 flex flex-col md:flex-row items-center gap-12 md:gap-16">
        <div className="w-full md:w-1/2">
          <h2
            className="text-4xl sm:text-5xl font-bold text-text-primary leading-tight"
            style={{ letterSpacing: "-0.06em" }}
          >
            Decisions you can trust.
          </h2>
          <p className="text-base text-text-secondary mt-5 leading-relaxed max-w-md">
            Every recovery decision is backed by clear evidence, so you always know why Settle acted.
          </p>
        </div>
        <div className="w-full md:w-1/2">
          <Image
            src="/landing_3.svg"
            alt=""
            width={960}
            height={600}
            className="w-full h-auto"
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-border-subtle mt-16">
        <div className="max-w-6xl mx-auto px-8 py-12 flex flex-col md:flex-row justify-between gap-10">
          {/* Left: Logo + tagline */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.svg" alt="Settle" width={28} height={28} className="object-contain" />
              <span className="text-lg font-semibold text-text-primary" style={{ letterSpacing: "-0.02em" }}>Settle</span>
            </div>
            <p className="text-sm text-text-muted max-w-xs">
              Know what&apos;s owed. Settle what remains.
            </p>
          </div>

          {/* Right: Nav links */}
          <div className="flex items-start gap-8">
            <a href="#hero" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Overview</a>
            <a href="#hero" className="text-sm text-text-secondary hover:text-text-primary transition-colors">How it works</a>
            <a href="#hero" className="text-sm text-text-secondary hover:text-text-primary transition-colors">AI</a>
            <Link href="/login" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Try Settle</Link>
          </div>
        </div>

        {/* Bottom row */}
        <div className="max-w-6xl mx-auto px-8 pb-10 flex flex-col sm:flex-row justify-between gap-4">
          <p className="text-xs text-text-muted">&copy; 2026 Settle. All rights reserved.</p>
          <p className="text-xs text-text-muted">Built for smarter revenue recovery.</p>
        </div>
      </footer>
    </div>
  );
}
