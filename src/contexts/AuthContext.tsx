import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

export interface SaaSUser {
  id: string;
  name: string;
  email: string;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  credits: number;
  unlimitedCredits: boolean;
  avatar: string;
}

interface AuthContextProps {
  user: SaaSUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; message: string }>;
  loginWithSocial: (provider: 'google' | 'facebook' | 'apple') => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  deductCredit: (amount: number) => boolean;
  addCredits: (amount: number, newTier?: 'free' | 'starter' | 'pro' | 'enterprise') => void;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const useAuth = (): AuthContextProps => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const parseAllowedList = (value?: string) =>
  (value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const allowedEmails = parseAllowedList(import.meta.env.VITE_ALLOWED_EMAILS);
const allowedDomains = parseAllowedList(import.meta.env.VITE_ALLOWED_DOMAINS);
const unlimitedCreditEmails = parseAllowedList(import.meta.env.VITE_UNLIMITED_CREDIT_EMAILS);
const unlimitedCreditDomains = parseAllowedList(import.meta.env.VITE_UNLIMITED_CREDIT_DOMAINS);
const unlimitedCreditsForAll = String(import.meta.env.VITE_UNLIMITED_CREDITS || '').toLowerCase() === 'true';

function isAllowedEmail(email?: string | null) {
  const normalizedEmail = (email || '').toLowerCase();
  if (!allowedEmails.length && !allowedDomains.length) return true;
  if (allowedEmails.includes(normalizedEmail)) return true;

  const domain = normalizedEmail.split('@')[1] || '';
  return Boolean(domain && allowedDomains.includes(domain));
}

function hasUnlimitedCredits(email?: string | null) {
  if (unlimitedCreditsForAll) return true;

  const normalizedEmail = (email || '').toLowerCase();
  if (!normalizedEmail) return false;
  if (unlimitedCreditEmails.includes(normalizedEmail)) return true;

  const domain = normalizedEmail.split('@')[1] || '';
  return Boolean(domain && unlimitedCreditDomains.includes(domain));
}

function getCreditStorageKey(uid: string) {
  return `saas_user_meta_${uid}`;
}

function loadUserMeta(uid: string) {
  try {
    const raw = localStorage.getItem(getCreditStorageKey(uid));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveUserMeta(uid: string, meta: Partial<Pick<SaaSUser, 'credits' | 'tier'>>) {
  localStorage.setItem(getCreditStorageKey(uid), JSON.stringify(meta));
}

function mapFirebaseUser(firebaseUser: FirebaseUser, nameOverride?: string): SaaSUser {
  const meta = loadUserMeta(firebaseUser.uid);
  const name = nameOverride || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'PicSeller User';

  return {
    id: firebaseUser.uid,
    name,
    email: firebaseUser.email || '',
    tier: hasUnlimitedCredits(firebaseUser.email) ? 'enterprise' : meta.tier || 'free',
    credits: typeof meta.credits === 'number' ? meta.credits : 5,
    unlimitedCredits: hasUnlimitedCredits(firebaseUser.email),
    avatar:
      firebaseUser.photoURL ||
      `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
  };
}

function getFirebaseAuthMessage(error: any) {
  const code = error?.code || '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (code === 'auth/user-not-found') return 'ไม่พบบัญชีนี้ใน Firebase';
  if (code === 'auth/email-already-in-use') return 'อีเมลนี้ถูกใช้งานแล้ว';
  if (code === 'auth/weak-password') return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  if (code === 'auth/popup-closed-by-user') return 'หน้าต่าง Google Login ถูกปิดก่อนเข้าสู่ระบบสำเร็จ';
  if (code === 'auth/operation-not-allowed') return 'ยังไม่ได้เปิด provider นี้ใน Firebase Authentication';
  return error?.message || 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์';
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<SaaSUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          return;
        }

        if (!isAllowedEmail(firebaseUser.email)) {
          await signOut(auth);
          setUser(null);
          return;
        }

        setUser(mapFirebaseUser(firebaseUser));
      } finally {
        setIsLoading(false);
      }
    });
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (!isAllowedEmail(credential.user.email)) {
        await signOut(auth);
        return { success: false, message: 'บัญชีนี้ยังไม่ได้รับอนุญาตให้ใช้งาน PicSeller' };
      }
      setUser(mapFirebaseUser(credential.user));
      return { success: true, message: 'เข้าสู่ระบบสำเร็จ ยินดีต้อนรับกลับ!' };
    } catch (error: any) {
      return { success: false, message: getFirebaseAuthMessage(error) };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, name: string): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(credential.user, { displayName: name.trim() });

      if (!isAllowedEmail(credential.user.email)) {
        await signOut(auth);
        return { success: false, message: 'สร้างบัญชีแล้ว แต่บัญชีนี้ยังไม่ได้รับอนุญาตให้ใช้งาน PicSeller' };
      }

      const userData = mapFirebaseUser(credential.user, name.trim());
      setUser(userData);
      saveUserMeta(credential.user.uid, { credits: userData.credits, tier: userData.tier });
      return { success: true, message: 'สมัครสมาชิกสำเร็จ! ได้รับสิทธิ์ฟรี 5 เครดิตสำหรับการทดลองใช้' };
    } catch (error: any) {
      return { success: false, message: getFirebaseAuthMessage(error) };
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithSocial = async (provider: 'google' | 'facebook' | 'apple'): Promise<{ success: boolean; message: string }> => {
    if (provider !== 'google') {
      return { success: false, message: 'ตอนนี้เปิดใช้งานเฉพาะ Google Login' };
    }

    setIsLoading(true);
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      if (!isAllowedEmail(credential.user.email)) {
        await signOut(auth);
        return { success: false, message: 'บัญชี Google นี้ยังไม่ได้รับอนุญาตให้ใช้งาน PicSeller' };
      }
      setUser(mapFirebaseUser(credential.user));
      return { success: true, message: 'ล็อกอินผ่าน Google สำเร็จ!' };
    } catch (error: any) {
      return { success: false, message: getFirebaseAuthMessage(error) };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    void signOut(auth);
  };

  const deductCredit = (amount: number): boolean => {
    if (!user) return false;
    if (user.unlimitedCredits) return true;
    if (user.credits < amount) return false;

    const updatedUser = {
      ...user,
      credits: user.credits - amount,
    };

    setUser(updatedUser);
    saveUserMeta(user.id, { credits: updatedUser.credits, tier: updatedUser.tier });
    return true;
  };

  const addCredits = (amount: number, newTier?: 'free' | 'starter' | 'pro' | 'enterprise') => {
    if (!user) return;

    const updatedUser = {
      ...user,
      credits: user.credits + amount,
      tier: newTier || user.tier,
    };

    setUser(updatedUser);
    saveUserMeta(user.id, { credits: updatedUser.credits, tier: updatedUser.tier });
  };

  const value = useMemo(
    () => ({
      user,
      isLoading,
      login,
      register,
      loginWithSocial,
      logout,
      deductCredit,
      addCredits,
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
