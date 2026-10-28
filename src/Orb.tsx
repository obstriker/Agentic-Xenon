import { useEffect, useRef } from "react";

export type OrbMode = 0 | 1 | 2; // 0 available · 1 listening · 2 briefing

type Props = {
  mode: OrbMode;
  onActivate: () => void;
};

/** Siri-like flowing ribbons drawn in Canvas2D. Ported unchanged from the v7 mockup. */
export function Orb({ mode, onActivate }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ mode, energy: 0, pointer: { x: 0.5, y: 0.5 } });

  // A mode change gives the orb a kick of energy
  useEffect(() => {
    live.current.mode = mode;
    live.current.energy = 1;
  }, [mode]);

  useEffect(() => {
    const el = wrap.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const motionOff = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const r = el.getBoundingClientRect();
      const d = Math.min(devicePixelRatio || 1, 2);
      cv.width = r.width * d;
      cv.height = r.height * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    const draw = (t: number) => {
      const s = live.current;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) {
        // Hidden view: nothing to draw, keep the loop alive for when it comes back
        raf = requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2 + (s.pointer.x - 0.5) * 38;
      const cy = h / 2 + (s.pointer.y - 0.5) * 25;
      const scale = Math.min(w * 0.36, h * 0.41, 195);
      const listening = s.mode === 1;
      const speaking = s.mode === 2;
      const time = motionOff ? 0 : t * 0.001;

      for (let j = 0; j < 48; j++) {
        const angle = (j / 47) * Math.PI * 2;
        const dynamic = motionOff ? 0 : Math.sin(time * (listening ? 3.4 : speaking ? 5.8 : 1.8) + j * 0.4) * (0.08 + (listening ? 0.08 : 0));
        const r = scale * (0.55 + dynamic + (listening ? 0.07 : 0));
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r * 0.63;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, scale * 0.6);
        const hue = 190 + Math.sin(angle * 2 + time * 0.4) * 55;
        grad.addColorStop(0, `hsla(${hue},90%,77%,${0.07 + s.energy * 0.1})`);
        grad.addColorStop(1, `hsla(${hue},90%,60%,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, scale * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let line = 0; line < 24; line++) {
        ctx.beginPath();
        const phase = (line / 24) * Math.PI * 2;
        for (let i = 0; i <= 180; i++) {
          const u = i / 180;
          const xx = cx + (u - 0.5) * scale * 2.15;
          const env = Math.pow(Math.max(0, 1 - Math.abs(u - 0.5) * 1.9), 1.5);
          const wave =
            Math.sin(u * 21 + phase + time * (listening ? 5 : speaking ? 7.5 : 2.3)) * 0.25 +
            Math.sin(u * 8 - phase * 0.8 - time * 1.7) * 0.22;
          const yy = cy + (line - 11.5) * 1.1 + wave * scale * env * (listening ? 1.2 : speaking ? 1.4 : 0.7) + (s.pointer.y - 0.5) * 25;
          if (i === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.strokeStyle = `hsla(${180 + line * 5},95%,${64 + Math.sin(phase) * 14}%,${0.3 + Math.sin(phase) * 0.12})`;
        ctx.lineWidth = line % 4 === 0 ? 2.2 : 1.25;
        ctx.stroke();
      }

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.92);
      g.addColorStop(0, "#74c5fd18");
      g.addColorStop(0.6, "#568df012");
      g.addColorStop(1, "#245bd000");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, scale * 0.95, scale * 0.66, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      s.energy *= 0.95;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    let origin: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      origin = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      live.current.energy = 1;
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      live.current.pointer = {
        x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
      };
      live.current.energy = 0.9;
    };
    const up = (e: PointerEvent) => {
      // A tap activates; a drag only shapes the ribbons
      if (!origin || Math.abs(e.clientX - origin.x) + Math.abs(e.clientY - origin.y) < 20) onActivate();
      origin = null;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
  }, [onActivate]);

  return (
    <div
      ref={wrap}
      className="orbWrap"
      role="button"
      tabIndex={0}
      aria-label="Talk to Jarvis; drag to interact"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <canvas ref={canvas} aria-hidden="true" />
      <div className="orbHint">TAP TO SPEAK · DRAG TO SHAPE</div>
    </div>
  );
}
