import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <motion.button
      onClick={toggleTheme}
      className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-colors duration-300 ${
        isDark 
          ? 'bg-slate-700/80 hover:bg-slate-600 text-yellow-400' 
          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
      } ${className}`}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92, rotate: 15 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      title={isDark ? 'สวิตซ์ไปโหมดสว่าง' : 'สวิตซ์ไปโหมดมืด'}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.div
            key="moon"
            initial={{ rotate: -90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <Moon className="w-5 h-5" />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            initial={{ rotate: 90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: -90, scale: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <Sun className="w-5 h-5" />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Subtle glow ring */}
      <motion.div
        className={`absolute inset-0 rounded-xl ${isDark ? 'ring-1 ring-yellow-400/20' : 'ring-1 ring-orange-400/20'}`}
        animate={{ 
          opacity: [0.5, 1, 0.5],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.button>
  );
};

export default ThemeToggle;