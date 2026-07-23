import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Calm landing-page background.
 *
 * This intentionally has no canvas, particles, or pointer tracking. The
 * ambient blobs move very slowly so the page still feels alive without
 * competing with the product content or causing visual fatigue.
 */
export const KineticBackground: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes calm-ambient-drift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(3%, -2%, 0) scale(1.04); }
        }
        @keyframes calm-ambient-drift-reverse {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1.03); }
          50% { transform: translate3d(-3%, 2%, 0) scale(1); }
        }
        .calm-ambient-blob {
          animation: calm-ambient-drift 12s ease-in-out infinite;
          will-change: transform;
        }
        .calm-ambient-blob-reverse {
          animation: calm-ambient-drift-reverse 16s ease-in-out infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .calm-ambient-blob,
          .calm-ambient-blob-reverse { animation: none; }
        }
      `}</style>
      <div
        className={`absolute -left-32 -top-40 h-[34rem] w-[34rem] rounded-full blur-3xl ${
          isDark ? 'bg-orange-500/[0.07]' : 'bg-orange-300/[0.16]'
        } calm-ambient-blob`}
      />
      <div
        className={`absolute -right-40 top-[28%] h-[30rem] w-[30rem] rounded-full blur-3xl ${
          isDark ? 'bg-cyan-500/[0.055]' : 'bg-cyan-300/[0.13]'
        } calm-ambient-blob-reverse`}
      />
      <div
        className={`absolute bottom-[-18rem] left-[28%] h-[34rem] w-[34rem] rounded-full blur-3xl ${
          isDark ? 'bg-violet-500/[0.045]' : 'bg-violet-300/[0.10]'
        } calm-ambient-blob`}
      />
    </div>
  );
};

export default KineticBackground;
