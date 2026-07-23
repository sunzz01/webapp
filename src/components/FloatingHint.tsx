import React from 'react';

interface FloatingHintProps {
  title: string;
  description: string;
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

/** A lightweight hover/focus explanation that never changes page layout. */
export const FloatingHint: React.FC<FloatingHintProps> = ({ title, description, children, align = 'center' }) => {
  const alignment = align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';

  return (
    <span className="group relative inline-flex focus-within:z-50">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute top-full z-50 mt-3 w-64 ${alignment} translate-y-1 rounded-2xl border px-4 py-3 text-left opacity-0 shadow-2xl backdrop-blur-xl transition-all duration-200 ease-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 dark:border-white/15 dark:bg-[#142238]/95 dark:text-white border-slate-200 bg-white/95 text-slate-900`}
      >
        <span className="block text-xs font-black">{title}</span>
        <span className="mt-1 block text-[11px] leading-5 text-slate-500 dark:text-slate-300">{description}</span>
      </span>
    </span>
  );
};

export default FloatingHint;
