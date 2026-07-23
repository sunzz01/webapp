import React from 'react';

/** Decorative, GPU-friendly motion layer. It never receives pointer events or shifts layout. */
export const AmbientMotionBackground: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
    <style>{`
      @keyframes picseller-drift-a { 0%,100% { transform: translate3d(-5%,-4%,0) scale(1); } 50% { transform: translate3d(10%,8%,0) scale(1.16); } }
      @keyframes picseller-drift-b { 0%,100% { transform: translate3d(8%,4%,0) scale(1.08); } 50% { transform: translate3d(-10%,-8%,0) scale(.92); } }
      @keyframes picseller-orbit { 0% { transform: rotate(0deg) translateX(0); } 50% { transform: rotate(180deg) translateX(24px); } 100% { transform: rotate(360deg) translateX(0); } }
      @keyframes picseller-sweep { 0%,100% { opacity: .12; transform: translateX(-34%) rotate(-18deg); } 50% { opacity: .34; transform: translateX(34%) rotate(-18deg); } }
      .picseller-motion-a { animation: picseller-drift-a 19s ease-in-out infinite; will-change: transform; }
      .picseller-motion-b { animation: picseller-drift-b 24s ease-in-out infinite; will-change: transform; }
      .picseller-motion-orbit { animation: picseller-orbit 18s linear infinite; will-change: transform; }
      .picseller-motion-sweep { animation: picseller-sweep 14s ease-in-out infinite; will-change: transform, opacity; }
      @media (prefers-reduced-motion: reduce) {
        .picseller-motion-a, .picseller-motion-b, .picseller-motion-orbit, .picseller-motion-sweep { animation: none !important; }
      }
    `}</style>
    <div className={`absolute inset-0 opacity-[0.32] ${isDark ? 'bg-[linear-gradient(rgba(148,163,184,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.07)_1px,transparent_1px)]' : 'bg-[linear-gradient(rgba(100,116,139,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(100,116,139,.08)_1px,transparent_1px)]'} bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]`} />
    <div className={`picseller-motion-a absolute -left-36 top-12 h-[32rem] w-[32rem] rounded-full blur-3xl ${isDark ? 'bg-cyan-400/20' : 'bg-sky-400/20'}`} />
    <div className={`picseller-motion-b absolute -right-32 top-[28rem] h-[30rem] w-[30rem] rounded-full blur-3xl ${isDark ? 'bg-orange-400/16' : 'bg-orange-300/25'}`} />
    <div className={`picseller-motion-a absolute left-[35%] top-[58rem] h-96 w-96 rounded-full blur-3xl ${isDark ? 'bg-violet-500/14' : 'bg-violet-300/20'}`} />
    <div className="picseller-motion-sweep absolute -left-1/2 top-20 h-72 w-[130%] bg-gradient-to-r from-transparent via-white/20 to-transparent blur-2xl" />
    <div className={`picseller-motion-orbit absolute right-[9%] top-40 h-20 w-20 rounded-full border ${isDark ? 'border-cyan-300/20' : 'border-sky-400/20'}`} />
    <div className={`picseller-motion-orbit absolute left-[8%] top-[47rem] h-12 w-12 rounded-full border ${isDark ? 'border-orange-300/20' : 'border-orange-400/25'}`} style={{ animationDelay: '-7s' }} />
  </div>
);
