/**
 * Ultra-lightweight confetti — just 20 absolutely positioned divs
 * with randomized dx/dy CSS vars. Enough polish for a success moment.
 */
const COLORS = ["#10B981", "#0EA5E9", "#4338CA", "#F59E0B", "#F97316"];

export function Confetti() {
  const pieces = Array.from({ length: 24 }, (_, i) => {
    const dx = (Math.random() - 0.5) * 400;
    const dy = -(Math.random() * 300 + 100);
    const rot = (Math.random() - 0.5) * 720;
    const bg = COLORS[i % COLORS.length];
    const delay = Math.random() * 0.15;
    return (
      <span
        key={i}
        className="confetti-piece"
        style={{
          left: "50%", top: "50%", background: bg,
          animationDelay: `${delay}s`,
          // @ts-expect-error CSS vars
          "--dx": `${dx}px`, "--dy": `${dy}px`, "--rot": `${rot}deg`,
        }}
      />
    );
  });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces}
    </div>
  );
}
