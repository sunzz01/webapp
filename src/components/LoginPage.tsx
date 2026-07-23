import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  Chrome,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  onRegister: (email: string, password: string, name: string) => Promise<{ success: boolean; message: string }>;
  onGoogleLogin: () => Promise<{ success: boolean; message: string }>;
  isLoading: boolean;
}

const LoginPage: React.FC<LoginPageProps> = ({
  onLogin,
  onRegister,
  onGoogleLogin,
  isLoading,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset fields when switching mode
  useEffect(() => {
    setError('');
    setSuccess('');
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email || !password) {
      setError('กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }
    if (mode === 'register' && !name) {
      setError('กรุณากรอกชื่อผู้ใช้งาน');
      return;
    }
    if (password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }

    setSubmitting(true);
    try {
      const result =
        mode === 'login'
          ? await onLogin(email, password)
          : await onRegister(email, password, name);

      if (result.success) {
        setSuccess(result.message);
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const result = await onGoogleLogin();
      if (!result.success) {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถเข้าสู่ระบบผ่าน Google ได้');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 py-12 ${isDark ? 'bg-gray-900' : 'bg-gradient-to-br from-orange-50 via-white to-slate-50'}`}>
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-20 ${isDark ? 'bg-orange-500' : 'bg-orange-300'}`} />
        <div className={`absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-10 ${isDark ? 'bg-orange-600' : 'bg-orange-200'}`} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md"
      >
        {/* Card */}
        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-100'} rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border overflow-hidden`}>
          {/* Header */}
          <div className="px-10 pt-12 pb-8 text-center">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
              className="w-20 h-20 bg-orange-500 rounded-[1.75rem] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-500/30"
            >
              <Sparkles className="w-10 h-10 text-white" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}
            >
              PicSeller
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className={`text-xs font-bold uppercase tracking-[0.2em] mt-1 ${isDark ? 'text-gray-400' : 'text-slate-400'}`}
            >
              Visual Commerce Suite
            </motion.p>
          </div>

          {/* Tab Switcher */}
          <div className="mx-10 mb-8">
            <div className={`${isDark ? 'bg-gray-700' : 'bg-slate-100'} p-1.5 rounded-2xl flex`}>
              {(['login', 'register'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setMode(tab);
                    setEmail('');
                    setPassword('');
                    setName('');
                    setShowPassword(false);
                  }}
                  className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 ${
                    mode === tab
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                      : isDark
                        ? 'text-gray-400 hover:text-white'
                        : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  {tab === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  {tab === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-10 pb-10 space-y-5">
            {/* Success / Error Messages */}
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-bold rounded-2xl px-5 py-3 text-center"
                >
                  {error}
                </motion.div>
              )}
              {success && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-2xl px-5 py-3 text-center"
                >
                  {success}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Name Field (Register only) */}
            <AnimatePresence>
              {mode === 'register' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <label className={`block text-[10px] font-black uppercase tracking-[0.15em] mb-2 ${isDark ? 'text-gray-400' : 'text-slate-400'}`}>
                    ชื่อผู้ใช้งาน
                  </label>
                  <div className="relative">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2">
                      <User className={`w-5 h-5 ${isDark ? 'text-gray-500' : 'text-slate-300'}`} />
                    </div>
                    <input
                      type="text"
                      placeholder="ชื่อของคุณ"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`w-full pl-14 pr-6 py-4 rounded-2xl border-2 text-sm font-bold transition-all focus:outline-none ${
                        isDark
                          ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-orange-500'
                          : 'bg-slate-50 border-slate-100 text-slate-800 placeholder-slate-300 focus:border-orange-500 focus:bg-white'
                      }`}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email Field */}
            <div>
              <label className={`block text-[10px] font-black uppercase tracking-[0.15em] mb-2 ${isDark ? 'text-gray-400' : 'text-slate-400'}`}>
                อีเมล
              </label>
              <div className="relative">
                <div className="absolute left-5 top-1/2 -translate-y-1/2">
                  <Mail className={`w-5 h-5 ${isDark ? 'text-gray-500' : 'text-slate-300'}`} />
                </div>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full pl-14 pr-6 py-4 rounded-2xl border-2 text-sm font-bold transition-all focus:outline-none ${
                    isDark
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-orange-500'
                      : 'bg-slate-50 border-slate-100 text-slate-800 placeholder-slate-300 focus:border-orange-500 focus:bg-white'
                  }`}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className={`block text-[10px] font-black uppercase tracking-[0.15em] mb-2 ${isDark ? 'text-gray-400' : 'text-slate-400'}`}>
                รหัสผ่าน
              </label>
              <div className="relative">
                <div className="absolute left-5 top-1/2 -translate-y-1/2">
                  <Lock className={`w-5 h-5 ${isDark ? 'text-gray-500' : 'text-slate-300'}`} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-14 pr-14 py-4 rounded-2xl border-2 text-sm font-bold transition-all focus:outline-none ${
                    isDark
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-orange-500'
                      : 'bg-slate-50 border-slate-100 text-slate-800 placeholder-slate-300 focus:border-orange-500 focus:bg-white'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-5 top-1/2 -translate-y-1/2 transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-slate-300 hover:text-slate-500'}`}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={submitting || isLoading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-black text-sm rounded-2xl transition-all shadow-lg shadow-orange-500/30 flex items-center justify-center gap-3"
            >
              {submitting || isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                  {mode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชีใหม่'}
                </>
              )}
            </motion.button>

            {/* Divider */}
            <div className="flex items-center gap-4 py-2">
              <div className={`flex-1 h-px ${isDark ? 'bg-gray-700' : 'bg-slate-100'}`} />
              <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-gray-500' : 'text-slate-300'}`}>
                หรือ
              </span>
              <div className={`flex-1 h-px ${isDark ? 'bg-gray-700' : 'bg-slate-100'}`} />
            </div>

            {/* Google Login Button */}
            <motion.button
              type="button"
              onClick={handleGoogle}
              disabled={submitting || isLoading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full py-4 font-black text-sm rounded-2xl transition-all flex items-center justify-center gap-3 border-2 disabled:opacity-50 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600 hover:border-gray-500'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              {/* Google Logo SVG */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              เข้าสู่ระบบด้วย Google
            </motion.button>
          </form>

          {/* Footer */}
          <div className={`px-10 py-6 text-center border-t ${isDark ? 'border-gray-700' : 'border-slate-50'}`}>
            <p className={`text-[10px] font-bold ${isDark ? 'text-gray-500' : 'text-slate-300'}`}>
              {mode === 'login' ? (
                <>
                  ยังไม่มีบัญชี?{' '}
                  <button
                    onClick={() => setMode('register')}
                    className="text-orange-500 hover:text-orange-600 font-black transition-colors"
                  >
                    สมัครสมาชิกฟรี
                  </button>
                </>
              ) : (
                <>
                  มีบัญชีอยู่แล้ว?{' '}
                  <button
                    onClick={() => setMode('login')}
                    className="text-orange-500 hover:text-orange-600 font-black transition-colors"
                  >
                    เข้าสู่ระบบ
                  </button>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Brand Badge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 text-center"
        >
          <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-gray-600' : 'text-slate-300'}`}>
            Powered by Gemini AI • v1.3.0
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
