/**
 * M44 · Vercel-style mesh gradient backdrop. Landing hero **唯一**装饰元素.
 *
 * 5 个 radial ellipse 在不同位置 blend 出 cyan / blue / violet / magenta /
 * amber 色调流光. 完全静态 (Vercel 不晃动), opacity 较低做 atmospheric
 * backdrop. Hex 来自 globals.css `--color-grad-*` token, 跟 Vercel DESIGN.md
 * "三对 gradient stack" 一致.
 *
 * 用 SVG 而不是 canvas-painted 因为:
 *   - 100% SSR-friendly, 不依赖 hydration
 *   - 失败 fallback 优雅 (浏览器无法渲染时降级为透明)
 *   - GPU 加速 (浏览器内部 SVG filter)
 *
 * 不要尝试 miniaturise 这个 gradient (DESIGN.md Do's): 只在 hero scale 用,
 * 不放 icon 不放卡片.
 */
export function MeshGradient({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: -10 }}
    >
      <defs>
        {/* cyan-blue stop (develop pair) */}
        <radialGradient id="m-develop" cx="20%" cy="30%" r="50%">
          <stop offset="0%" stopColor="#00dfd8" stopOpacity="0.45" />
          <stop offset="50%" stopColor="#007cf0" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#007cf0" stopOpacity="0" />
        </radialGradient>
        {/* violet-magenta stop (preview pair) */}
        <radialGradient id="m-preview" cx="75%" cy="25%" r="50%">
          <stop offset="0%" stopColor="#7928ca" stopOpacity="0.40" />
          <stop offset="50%" stopColor="#ff0080" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#ff0080" stopOpacity="0" />
        </radialGradient>
        {/* coral-amber stop (ship pair) */}
        <radialGradient id="m-ship" cx="50%" cy="85%" r="55%">
          <stop offset="0%" stopColor="#ff4d4d" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#f9cb28" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f9cb28" stopOpacity="0" />
        </radialGradient>
        {/* small cyan accent */}
        <radialGradient id="m-cyan-spot" cx="85%" cy="70%" r="30%">
          <stop offset="0%" stopColor="#50e3c2" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#50e3c2" stopOpacity="0" />
        </radialGradient>
        {/* small violet accent */}
        <radialGradient id="m-violet-spot" cx="10%" cy="75%" r="30%">
          <stop offset="0%" stopColor="#7928ca" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#7928ca" stopOpacity="0" />
        </radialGradient>

        <filter id="m-blur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="40" />
        </filter>
      </defs>

      {/* 5 个 ellipse 用 blur filter 软化, 模拟 mesh 流光 */}
      <g filter="url(#m-blur)">
        <rect x="0" y="0" width="1200" height="700" fill="url(#m-develop)" />
        <rect x="0" y="0" width="1200" height="700" fill="url(#m-preview)" />
        <rect x="0" y="0" width="1200" height="700" fill="url(#m-ship)" />
        <rect x="0" y="0" width="1200" height="700" fill="url(#m-cyan-spot)" />
        <rect x="0" y="0" width="1200" height="700" fill="url(#m-violet-spot)" />
      </g>
    </svg>
  );
}
