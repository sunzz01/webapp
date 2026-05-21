import React from 'react';
import { motion } from 'framer-motion';
import { Settings, Grid3X3, Image, Check, ChevronRight } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

const steps = [
  { num: 1, label: 'ตั้งค่า', labelEn: 'Configure', icon: Settings },
  { num: 2, label: 'แกลเลอรี', labelEn: 'Gallery', icon: Grid3X3 },
  { num: 3, label: 'ผลลัพธ์', labelEn: 'Results', icon: Image },
];

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep, totalSteps }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="flex items-center justify-center gap-0 py-3">
      {steps.map((step, idx) => {
        const isActive = currentStep === step.num;
        const isCompleted = currentStep > step.num;
        const Icon = step.icon;

        return (
          <React.Fragment key={step.num}>
            <motion.div
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-colors duration-300 cursor-default"
              initial={false}
              animate={{
                backgroundColor: isActive
                  ? (isDark ? 'rgba(249,115,22,0.15)' : 'rgba(249,115,22,0.08)')
                  : 'transparent',
              }}
              transition={{ duration: 0.3 }}
            >
              {/* Step circle */}
              <motion.div
                className={`relative w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black transition-all duration-300 ${
                  isCompleted
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                    : isActive
                    ? isDark 
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                      : 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                    : isDark
                    ? 'bg-slate-700/80 text-slate-400'
                    : 'bg-slate-100 text-slate-400'
                }`}
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                {isCompleted ? (
                  <motion.div
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                  >
                    <Check className="w-4 h-4" strokeWidth={3} />
                  </motion.div>
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                
                {/* Active pulse ring */}
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-xl border-2 border-orange-400"
                    animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </motion.div>

              {/* Step text */}
              <div className="hidden sm:block">
                <motion.p
                  className={`text-xs font-black leading-tight ${
                    isActive || isCompleted ? 'text-orange-500' : isDark ? 'text-slate-500' : 'text-slate-400'
                  }`}
                  animate={{ opacity: isActive ? 1 : isCompleted ? 0.8 : 0.5 }}
                  transition={{ duration: 0.3 }}
                >
                  {step.label}
                </motion.p>
                <p className={`text-[9px] font-bold uppercase tracking-widest ${
                  isDark ? 'text-slate-600' : 'text-slate-300'
                }`}>
                  STEP {step.num}
                </p>
              </div>
            </motion.div>

            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div className="relative w-8 h-[2px] mx-1">
                <div className={`absolute inset-0 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`} />
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-400 to-orange-500"
                  initial={{ width: '0%' }}
                  animate={{ width: currentStep > step.num ? '100%' : '0%' }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default StepIndicator;