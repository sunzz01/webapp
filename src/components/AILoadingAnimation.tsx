import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Brain, Zap, Cpu, Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface AILoadingAnimationProps {
  isActive: boolean;
  currentStep: string;
  progress?: number;
}

const AILoadingAnimation: React.FC<AILoadingAnimationProps> = ({ isActive, currentStep, progress }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className={`relative overflow-hidden rounded-2xl border p-6 ${
            isDark 
              ? 'bg-slate-800/80 border-slate-700/50 backdrop-blur-xl' 
              : 'bg-white/80 border-slate-200/50 backdrop-blur-xl'
          } shadow-2xl`}
        >
          {/* Animated background gradient */}
          <motion.div
            className="absolute inset-0 opacity-30"
            animate={{
              background: [
                'radial-gradient(circle at 20% 50%, rgba(249,115,22,0.15) 0%, transparent 50%)',
                'radial-gradient(circle at 80% 50%, rgba(249,115,22,0.15) 0%, transparent 50%)',
                'radial-gradient(circle at 50% 20%, rgba(249,115,22,0.15) 0%, transparent 50%)',
                'radial-gradient(circle at 20% 50%, rgba(249,115,22,0.15) 0%, transparent 50%)',
              ],
            }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          />

          <div className="relative flex items-center gap-5">
            {/* Spinning AI icon */}
            <div className="relative flex-shrink-0">
              <motion.div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                  isDark ? 'bg-orange-500/20' : 'bg-orange-50'
                }`}
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Brain className="w-7 h-7 text-orange-500" />
              </motion.div>
              <motion.div
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Sparkles className="w-3 h-3 text-white" />
              </motion.div>
            </div>

            {/* Text and progress */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <motion.span
                  className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}
                  key={currentStep}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {currentStep}
                </motion.span>
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Loader2 className={`w-4 h-4 animate-spin ${isDark ? 'text-orange-400' : 'text-orange-500'}`} />
                </motion.div>
              </div>

              {/* Progress bar */}
              {progress !== undefined && (
                <div className="w-full mt-2">
                  <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600"
                      initial={{ width: '0%' }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      Processing
                    </span>
                    <span className="text-[10px] font-bold text-orange-500">
                      {Math.round(progress)}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Floating particles */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  className={`absolute w-1 h-1 rounded-full ${isDark ? 'bg-orange-400' : 'bg-orange-300'}`}
                  animate={{
                    x: [0, 20 + i * 10, 0],
                    y: [0, -15 + i * 10, 0],
                    opacity: [0, 1, 0],
                    scale: [0, 1.5, 0],
                  }}
                  transition={{
                    duration: 2 + i * 0.5,
                    repeat: Infinity,
                    delay: i * 0.3,
                    ease: 'easeInOut',
                  }}
                  style={{ left: -10 * i, top: -10 + i * 10 }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AILoadingAnimation;