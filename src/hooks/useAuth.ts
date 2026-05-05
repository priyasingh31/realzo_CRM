import { useAuthStore } from '@/store/authStore';
import { signIn, logOut, requestPasswordReset } from '@/services/authService';

export function useAuth() {
  const { user, isLoading, isAuthenticated, setUser, setLoading, logout } = useAuthStore();

  const handleSignIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const userData = await signIn(email, password);
      setUser(userData);
      return { success: true };
    } catch (err: unknown) {
      setLoading(false);
      const error = err as { code?: string; message: string };
      return { success: false, error: getAuthErrorMessage(error.code ?? error.message) };
    }
  };

  const handleLogout = async () => {
    try {
      await logOut();   // Firebase signOut
      logout();          // clear Zustand store → triggers <Redirect> in (app)/_layout.tsx
    } catch (err) {
      console.error('Logout error:', err);
      // Force clear store even if Firebase signOut failed (e.g. no network)
      logout();
    }
  };

  const handlePasswordReset = async (email: string) => {
    try {
      await requestPasswordReset(email);
      return { success: true };
    } catch (err: unknown) {
      const error = err as Error;
      return { success: false, error: error.message };
    }
  };

  return {
    user,
    isLoading,
    isAuthenticated,
    signIn: handleSignIn,
    logout: handleLogout,
    resetPassword: handlePasswordReset,
  };
}

function getAuthErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-credential': 'Incorrect email or password. Please try again.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    'auth/user-disabled': 'This account has been disabled. Contact your administrator.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
  };
  return messages[code] || code || 'Sign in failed. Please try again.';
}
