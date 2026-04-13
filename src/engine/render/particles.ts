/**
 * render/particles.ts
 *
 * Hit-effect particle system. Self-contained — no component refs.
 * Create one instance per NoteField via `createParticleSystem()`.
 */

import type { QualityLevel } from "./drawers";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;   // 0–1, decremented each frame
  decay: number;  // life units lost per second
  size: number;
  color: string;
  type: "spark" | "ring" | "glow";
}

export interface ParticleSystem {
  /** Current live particle count (for perf reporting). */
  readonly count: number;
  /**
   * Spawn a hit explosion at (x, y).
   * @param judgment  "W1"–"W4" rating string for particle density.
   */
  spawnHitEffect(
    x: number,
    y: number,
    color: string,
    judgment: string,
    qualityLevel: QualityLevel,
    showParticles: boolean,
  ): void;
  /** Advance physics and render all live particles into `c`. */
  updateAndDraw(c: CanvasRenderingContext2D, dt: number, qualityLevel: QualityLevel): void;
}

export function createParticleSystem(): ParticleSystem {
  const particles: Particle[] = [];

  return {
    get count() {
      return particles.length;
    },

    spawnHitEffect(x, y, color, judgment, qualityLevel, showParticles) {
      if (!showParticles) return;

      const baseCount = judgment === "W1" ? 18 : judgment === "W2" ? 14 : judgment === "W3" ? 10 : 6;
      const count =
        qualityLevel === "high"
          ? baseCount
          : qualityLevel === "medium"
            ? Math.max(4, Math.floor(baseCount * 0.55))
            : Math.max(2, Math.floor(baseCount * 0.3));

      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const speed = 80 + Math.random() * 120;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 1.8 + Math.random() * 1.2,
          size: 2 + Math.random() * 3,
          color,
          type: "spark",
        });
      }

      particles.push({ x, y, vx: 0, vy: 0, life: 1, decay: 3.5, size: qualityLevel === "low" ? 6 : 8, color, type: "ring" });

      if (qualityLevel === "high") {
        particles.push({ x, y, vx: 0, vy: 0, life: 1, decay: 4.0, size: 24, color, type: "glow" });
      }
    },

    updateAndDraw(c, dt, _qualityLevel) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.life -= p.decay * dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 180 * dt; // gravity

        c.save();
        c.globalAlpha = Math.max(0, p.life) * (p.type === "glow" ? 0.35 : 0.9);

        if (p.type === "spark") {
          c.fillStyle = p.color;
          c.shadowColor = p.color;
          c.shadowBlur = 6;
          c.beginPath();
          c.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          c.fill();
        } else if (p.type === "ring") {
          const r = p.size + (1 - p.life) * 28;
          c.strokeStyle = p.color;
          c.lineWidth = 2 * p.life;
          c.shadowColor = p.color;
          c.shadowBlur = 10;
          c.beginPath();
          c.arc(p.x, p.y, r, 0, Math.PI * 2);
          c.stroke();
        } else {
          const r = p.size + (1 - p.life) * 20;
          const grad = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          grad.addColorStop(0, p.color + "ff");
          grad.addColorStop(1, p.color + "00");
          c.fillStyle = grad;
          c.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        }

        c.restore();
      }
    },
  };
}
