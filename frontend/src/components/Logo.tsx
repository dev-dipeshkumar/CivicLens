// Simple wordmark that pairs the brand icon with "CivicLens AI".
// `variant` controls dark/light usage.

interface Props { variant?: "light" | "dark"; size?: number; className?: string; }

export function Logo({ variant = "light", size = 28, className = "" }: Props) {
  const text = variant === "light" ? "text-ink" : "text-white";
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#4338CA" />
            <stop offset="100%" stopColor="#0EA5E9" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#lg)" />
        <circle cx="16" cy="16" r="6.5" fill="none" stroke="#fff" strokeWidth="2.4" />
        <circle cx="16" cy="16" r="2.2" fill="#fff" />
      </svg>
      <span className={`font-display font-bold tracking-tight ${text}`}>
        CivicLens <span className="text-brand-sky">AI</span>
      </span>
    </div>
  );
}
