import React, { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  speed: number;
  color: string;
}

interface GeometricMarker {
  x: number;
  y: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  type: 'cross' | 'square' | 'dot';
}

export const KineticBackground: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Mouse tracker
    const mouse = {
      x: width / 2,
      y: height / 2,
      targetX: width / 2,
      targetY: height / 2,
      active: false,
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      mouse.active = true;
    };

    const handleMouseLeave = () => {
      mouse.active = false;
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initGrid();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('resize', handleResize);

    // Grid Particles Setup
    let particles: Particle[] = [];
    let markers: GeometricMarker[] = [];

    const initGrid = () => {
      particles = [];
      markers = [];

      const spacing = Math.max(45, Math.min(80, Math.floor(width / 24)));
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * spacing;
          const y = j * spacing;
          const phase = Math.random() * Math.PI * 2;
          const speed = 0.008 + Math.random() * 0.012;

          // Color distribution
          const isOrange = Math.random() < 0.15;
          const isCyan = Math.random() < 0.1;
          const color = isOrange
            ? 'rgba(249, 115, 22, '
            : isCyan
            ? 'rgba(56, 189, 248, '
            : isDark
            ? 'rgba(148, 163, 184, '
            : 'rgba(71, 85, 105, ';

          particles.push({
            x,
            y,
            originX: x,
            originY: y,
            vx: 0,
            vy: 0,
            radius: Math.random() * 1.5 + 1.2,
            phase,
            speed,
            color,
          });
        }
      }

      // Add a few subtle geometric markers across the screen
      const markerCount = Math.floor((width * height) / 120000);
      for (let k = 0; k < markerCount; k++) {
        markers.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 10 + 8,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.005,
          type: Math.random() > 0.5 ? 'cross' : 'square',
        });
      }
    };

    initGrid();

    let time = 0;

    const render = () => {
      time += 0.015;

      // Smooth mouse lerp
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;

      ctx.clearRect(0, 0, width, height);

      // 1. Draw subtle ambient gradient backdrop
      const bgGrad = ctx.createRadialGradient(
        mouse.x,
        mouse.y,
        0,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.8
      );

      if (isDark) {
        bgGrad.addColorStop(0, 'rgba(30, 41, 59, 0.45)');
        bgGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.8)');
        bgGrad.addColorStop(1, 'rgba(9, 13, 22, 1)');
      } else {
        bgGrad.addColorStop(0, 'rgba(255, 247, 237, 0.6)');
        bgGrad.addColorStop(0.5, 'rgba(248, 250, 252, 0.85)');
        bgGrad.addColorStop(1, 'rgba(241, 245, 249, 1)');
      }

      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Draw Trigonometric Wave Grid Lines
      const lineStep = Math.max(60, Math.floor(width / 16));
      ctx.lineWidth = 1;

      for (let yPos = 0; yPos < height; yPos += lineStep) {
        ctx.beginPath();
        const waveAlpha = isDark ? 0.04 : 0.035;
        ctx.strokeStyle = isDark
          ? `rgba(255, 255, 255, ${waveAlpha})`
          : `rgba(15, 23, 42, ${waveAlpha})`;

        for (let xPos = 0; xPos <= width; xPos += 20) {
          const distToMouse = Math.hypot(xPos - mouse.x, yPos - mouse.y);
          const mouseEffect = Math.max(0, (260 - distToMouse) / 260);
          const wave =
            Math.sin(xPos * 0.005 + time + yPos * 0.01) * 6 +
            Math.cos(xPos * 0.003 - time) * 4 +
            mouseEffect * 12 * Math.sin(time * 3);

          if (xPos === 0) {
            ctx.moveTo(xPos, yPos + wave);
          } else {
            ctx.lineTo(xPos, yPos + wave);
          }
        }
        ctx.stroke();
      }

      // 3. Update & Draw Particles & Micro Connections
      const maxDist = 85;
      const mouseRadius = 180;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Wave oscillation from origin
        p.phase += p.speed;
        const waveX = Math.cos(p.phase) * 5;
        const waveY = Math.sin(p.phase) * 5;

        const targetX = p.originX + waveX;
        const targetY = p.originY + waveY;

        // Interaction with mouse cursor
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.hypot(dx, dy);

        if (dist < mouseRadius && mouse.active) {
          const force = (mouseRadius - dist) / mouseRadius;
          const angle = Math.atan2(dy, dx);
          p.vx += Math.cos(angle) * force * 1.8;
          p.vy += Math.sin(angle) * force * 1.8;
        }

        // Return physics (spring back to origin)
        p.vx += (targetX - p.x) * 0.04;
        p.vy += (targetY - p.y) * 0.04;
        p.vx *= 0.85;
        p.vy *= 0.85;

        p.x += p.vx;
        p.y += p.vy;

        // Draw particle
        const alpha = isDark ? 0.35 : 0.45;
        ctx.fillStyle = `${p.color}${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();

        // Connect nearby particles with thin laser lines
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const pdx = p.x - p2.x;
          const pdy = p.y - p2.y;
          const pdist = Math.hypot(pdx, pdy);

          if (pdist < maxDist) {
            const lineAlpha = (1 - pdist / maxDist) * (isDark ? 0.12 : 0.08);
            ctx.strokeStyle = isDark
              ? `rgba(249, 115, 22, ${lineAlpha})`
              : `rgba(71, 85, 105, ${lineAlpha})`;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      // 4. Draw Micro Geometric Accents
      for (const m of markers) {
        m.rotation += m.rotSpeed;
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.rotation);

        const markerAlpha = isDark ? 0.18 : 0.22;
        ctx.strokeStyle = isDark
          ? `rgba(255, 255, 255, ${markerAlpha})`
          : `rgba(15, 23, 42, ${markerAlpha})`;
        ctx.lineWidth = 1;

        if (m.type === 'cross') {
          const half = m.size / 2;
          ctx.beginPath();
          ctx.moveTo(-half, 0);
          ctx.lineTo(half, 0);
          ctx.moveTo(0, -half);
          ctx.lineTo(0, half);
          ctx.stroke();
        } else if (m.type === 'square') {
          const half = m.size / 2;
          ctx.strokeRect(-half, -half, m.size, m.size);
        }

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
    };
  }, [isDark]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};

export default KineticBackground;
