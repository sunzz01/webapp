import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface SaaSUser {
  id: string;
  name: string;
  email: string;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  credits: number;
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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<SaaSUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load session on startup
  useEffect(() => {
    const restoreSession = () => {
      try {
        const savedUser = localStorage.getItem('saas_current_user');
        if (savedUser) {
          setUser(JSON.parse(savedUser));
        }
      } catch (error) {
        console.error('Failed to parse saved user session:', error);
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
  }, []);

  // Helper: Get users database from localStorage
  const getStoredUsers = (): Record<string, any> => {
    try {
      const raw = localStorage.getItem('saas_simulated_db');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  // Helper: Save users database to localStorage
  const saveStoredUsers = (users: Record<string, any>) => {
    localStorage.setItem('saas_simulated_db', JSON.stringify(users));
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    const db = getStoredUsers();
    const formattedEmail = email.trim().toLowerCase();

    if (!db[formattedEmail]) {
      setIsLoading(false);
      return { success: false, message: 'ไม่พบอีเมลนี้ในระบบ กรุณาสมัครสมาชิก' };
    }

    if (db[formattedEmail].password !== password) {
      setIsLoading(false);
      return { success: false, message: 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' };
    }

    const userData: SaaSUser = {
      id: db[formattedEmail].id,
      name: db[formattedEmail].name,
      email: db[formattedEmail].email,
      tier: db[formattedEmail].tier || 'free',
      credits: db[formattedEmail].credits ?? 5,
      avatar: db[formattedEmail].avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${db[formattedEmail].name}`
    };

    setUser(userData);
    localStorage.setItem('saas_current_user', JSON.stringify(userData));
    setIsLoading(false);

    return { success: true, message: 'เข้าสู่ระบบสำเร็จ ยินดีต้อนรับกลับ!' };
  };

  const register = async (email: string, password: string, name: string): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    const db = getStoredUsers();
    const formattedEmail = email.trim().toLowerCase();

    if (db[formattedEmail]) {
      setIsLoading(false);
      return { success: false, message: 'อีเมลนี้ถูกใช้งานแล้วในระบบ' };
    }

    const newUserId = `usr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name.trim())}`;
    
    // Write new user to DB
    db[formattedEmail] = {
      id: newUserId,
      name: name.trim(),
      email: formattedEmail,
      password: password,
      tier: 'free',
      credits: 5, // 5 free starter credits
      avatar
    };

    saveStoredUsers(db);

    const userData: SaaSUser = {
      id: newUserId,
      name: name.trim(),
      email: formattedEmail,
      tier: 'free',
      credits: 5,
      avatar
    };

    setUser(userData);
    localStorage.setItem('saas_current_user', JSON.stringify(userData));
    setIsLoading(false);

    return { success: true, message: 'สมัครสมาชิกสำเร็จ! ได้รับสิทธิ์ฟรี 5 เครดิตสำหรับการทดลองใช้' };
  };

  const loginWithSocial = async (provider: 'google' | 'facebook' | 'apple'): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    
    // Simulate social login popup delay
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
    const mockName = `${providerName} Customer`;
    const mockEmail = `customer.${provider}@${provider}.com`;
    const avatar = provider === 'google' 
      ? 'https://api.dicebear.com/7.x/bottts/svg?seed=google'
      : provider === 'facebook'
      ? 'https://api.dicebear.com/7.x/pixel-art/svg?seed=facebook'
      : 'https://api.dicebear.com/7.x/identicon/svg?seed=apple';

    const db = getStoredUsers();
    
    let userData: SaaSUser;
    if (db[mockEmail]) {
      // Existing social user
      userData = {
        id: db[mockEmail].id,
        name: db[mockEmail].name,
        email: db[mockEmail].email,
        tier: db[mockEmail].tier || 'free',
        credits: db[mockEmail].credits ?? 5,
        avatar: db[mockEmail].avatar || avatar
      };
    } else {
      // Create new social user
      const newUserId = `usr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      db[mockEmail] = {
        id: newUserId,
        name: mockName,
        email: mockEmail,
        tier: 'free',
        credits: 5,
        avatar
      };
      saveStoredUsers(db);
      
      userData = {
        id: newUserId,
        name: mockName,
        email: mockEmail,
        tier: 'free',
        credits: 5,
        avatar
      };
    }

    setUser(userData);
    localStorage.setItem('saas_current_user', JSON.stringify(userData));
    setIsLoading(false);

    return { success: true, message: `ล็อกอินผ่าน ${providerName} สำเร็จ!` };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('saas_current_user');
  };

  const deductCredit = (amount: number): boolean => {
    if (!user) return false;

    if (user.credits < amount) {
      return false;
    }

    const updatedUser = {
      ...user,
      credits: user.credits - amount
    };

    setUser(updatedUser);
    localStorage.setItem('saas_current_user', JSON.stringify(updatedUser));

    // Update DB
    const db = getStoredUsers();
    const formattedEmail = user.email.trim().toLowerCase();
    if (db[formattedEmail]) {
      db[formattedEmail].credits = updatedUser.credits;
      saveStoredUsers(db);
    }

    return true;
  };

  const addCredits = (amount: number, newTier?: 'free' | 'starter' | 'pro' | 'enterprise') => {
    if (!user) return;

    const updatedUser = {
      ...user,
      credits: user.credits + amount,
      tier: newTier || user.tier
    };

    setUser(updatedUser);
    localStorage.setItem('saas_current_user', JSON.stringify(updatedUser));

    // Update DB
    const db = getStoredUsers();
    const formattedEmail = user.email.trim().toLowerCase();
    if (db[formattedEmail]) {
      db[formattedEmail].credits = updatedUser.credits;
      if (newTier) db[formattedEmail].tier = newTier;
      saveStoredUsers(db);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        loginWithSocial,
        logout,
        deductCredit,
        addCredits
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
