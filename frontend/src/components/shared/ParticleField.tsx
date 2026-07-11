import { useEffect, useRef } from "react";
import { useStore } from "../../store";
import { useTheme } from "../../contexts/ThemeContext";

// v1.5.0 cursor-reactive particle background. One fixed canvas behind the
// content: 50-300 soft dots (Settings → Customization) in the theme accent,
// drifting slowly; the cursor repels nearby particles (fluid, ~500ms return)
// and shifts each depth layer a few px for parallax. 2D canvas = one
// composited layer, no per-particle DOM. Fully disabled under
// prefers-reduced-motion or the user toggle.

interface Particle {
  baseX: number;      // home position, fractions of the viewport
  baseY: number;
  offsetX: number;    // current displacement from home (px)
  offsetY: number;
  velX: number;
  velY: number;
  driftPhase: number; // underwater sway
  driftSpeed: number;
  driftAmp: number;
  radius: number;     // 2.5-7.5px (5-15px diameter per the brief)
  depth: number;      // 0 far … 1 near; scales parallax + alpha
}

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    baseX: Math.random(),
    baseY: Math.random(),
    offsetX: 0,
    offsetY: 0,
    velX: 0,
    velY: 0,
    driftPhase: Math.random() * Math.PI * 2,
    driftSpeed: 0.2 + Math.random() * 0.3,   // rad/s — slow sway
    driftAmp: 6 + Math.random() * 10,        // px
    radius: 2.5 + Math.random() * 5,
    depth: Math.random(),
  }));
}

const REPEL_RADIUS = 130;   // px around the cursor
const REPEL_FORCE = 900;    // px/s² at zero distance
const RETURN_STIFFNESS = 9; // spring back to home (~500ms settle)
const DAMPING = 5.5;
const PARALLAX_MAX = 8;     // px shift of the deepest layer

export default function ParticleField() {
  const enabled = useStore((s) => s.fxParticles);
  const count = useStore((s) => s.fxParticleCount);
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return undefined;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue("--od-accent-primary").trim() || "151 51 255";

    let particles = makeParticles(count);
    let width = 0;
    let height = 0;
    let dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    // cursor state: parallax follows the cursor smoothly; repulsion only
    // acts while the cursor is actually over the window
    let cursorX = width / 2;
    let cursorY = height / 2;
    let cursorActive = false;
    let parallaxX = 0; // smoothed -1…1
    let parallaxY = 0;
    function onMove(e: MouseEvent) {
      cursorX = e.clientX;
      cursorY = e.clientY;
      cursorActive = true;
    }
    function onLeave() {
      cursorActive = false;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseout", onLeave);

    let raf = 0;
    let last = performance.now();

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); // clamp tab-switch jumps
      last = now;
      if (document.hidden) return;

      // parallax target from cursor position (center = 0)
      const targetPX = cursorActive ? (cursorX / width) * 2 - 1 : 0;
      const targetPY = cursorActive ? (cursorY / height) * 2 - 1 : 0;
      parallaxX += (targetPX - parallaxX) * Math.min(1, dt * 4);
      parallaxY += (targetPY - parallaxY) * Math.min(1, dt * 4);

      ctx!.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.driftPhase += p.driftSpeed * dt;
        const driftX = Math.cos(p.driftPhase) * p.driftAmp;
        const driftY = Math.sin(p.driftPhase * 0.8) * p.driftAmp;

        const homeX = p.baseX * width + driftX;
        const homeY = p.baseY * height + driftY;
        let x = homeX + p.offsetX;
        let y = homeY + p.offsetY;

        if (cursorActive) {
          const dx = x - cursorX;
          const dy = y - cursorY;
          const dist = Math.hypot(dx, dy);
          if (dist < REPEL_RADIUS && dist > 0.5) {
            const force = REPEL_FORCE * (1 - dist / REPEL_RADIUS);
            p.velX += (dx / dist) * force * dt;
            p.velY += (dy / dist) * force * dt;
          }
        }
        // spring home + damping = fluid return over ~500ms
        p.velX += (-p.offsetX * RETURN_STIFFNESS - p.velX * DAMPING) * dt;
        p.velY += (-p.offsetY * RETURN_STIFFNESS - p.velY * DAMPING) * dt;
        p.offsetX += p.velX * dt;
        p.offsetY += p.velY * dt;

        x = homeX + p.offsetX + parallaxX * PARALLAX_MAX * (0.3 + p.depth * 0.7);
        y = homeY + p.offsetY + parallaxY * PARALLAX_MAX * (0.3 + p.depth * 0.7);

        const alpha = 0.05 + p.depth * 0.13;
        ctx!.beginPath();
        ctx!.arc(x, y, p.radius, 0, Math.PI * 2);
        ctx!.fillStyle = `rgb(${accent} / ${alpha.toFixed(3)})`;
        ctx!.fill();
      }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
      ctx.clearRect(0, 0, width, height);
      particles = [];
    };
  }, [enabled, count, theme]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="particle-field"
      className="pointer-events-none fixed inset-0 -z-10"
    />
  );
}
