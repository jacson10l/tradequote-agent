import { type ReactNode, useEffect, useRef, useState } from "react";
import brandIcon from "../../../../resources/icon.svg";

const duration = 2200;
const fadeDuration = 400;
const handoffDuration = 650;

export function StartupScreen({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"intro" | "entering" | "ready">("intro");

  useEffect(() => {
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!motion || motion.matches) {
      setPhase("ready");
      return;
    }

    const timers = [
      window.setTimeout(() => setPhase("entering"), duration),
      window.setTimeout(() => setPhase("ready"), duration + handoffDuration),
    ];

    function onMotionChange() {
      if (!motion?.matches) return;
      for (const timer of timers) window.clearTimeout(timer);
      setPhase("ready");
    }

    motion.addEventListener("change", onMotionChange);
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      motion.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <div className="startup-experience" data-phase={phase}>
      <div
        className="startup-main"
        inert={phase === "intro"}
        aria-hidden={phase === "intro" ? true : undefined}
      >
        {children}
      </div>
      {phase !== "ready" && (
        <section className="startup-screen" role="status" aria-label="TradeQuote 正在启动">
          <StartupConfetti />
          <div className="startup-brand">
            <img className="startup-logo" src={brandIcon} alt="" />
            <h1>TradeQuote</h1>
            <p>询报价协同工作台</p>
          </div>
        </section>
      )}
    </div>
  );
}

export function StartupConfetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!motion || motion.matches) {
      setVisible(false);
      return;
    }
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      setVisible(false);
      return;
    }

    const particles = Array.from({ length: 120 }, () => ({
      velocityX: (Math.random() - 0.5) * 8,
      velocityY: Math.random() * -12,
      color: `hsl(${Math.random() * 360} 90% 60%)`,
    }));
    let width = window.innerWidth;
    let height = window.innerHeight;
    let frame = 0;
    const started = performance.now();

    function resize() {
      if (!canvas || !context) return;
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function cleanup() {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("resize", resize);
      motion?.removeEventListener("change", onMotionChange);
    }

    function finish() {
      cleanup();
      setVisible(false);
    }

    function onMotionChange() {
      if (motion?.matches) finish();
    }

    function draw(timestamp: number) {
      if (!context) return;
      const elapsed = Math.max(0, timestamp - started);
      if (elapsed >= duration) {
        finish();
        return;
      }
      const steps = elapsed / (1000 / 60);
      context.clearRect(0, 0, width, height);
      context.globalAlpha = Math.min(1, (duration - elapsed) / fadeDuration);
      for (const particle of particles) {
        context.fillStyle = particle.color;
        context.fillRect(
          width / 2 + particle.velocityX * steps,
          height * 0.68 + particle.velocityY * steps + 0.15 * steps * steps,
          6,
          6,
        );
      }
      frame = window.requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    motion.addEventListener("change", onMotionChange);
    const timer = window.setTimeout(finish, duration);
    frame = window.requestAnimationFrame(draw);
    return cleanup;
  }, []);

  return visible ? (
    <canvas ref={canvasRef} className="startup-confetti" aria-hidden="true" />
  ) : null;
}
