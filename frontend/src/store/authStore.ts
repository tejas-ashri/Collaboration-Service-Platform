import { create } from 'zustand';
import { authApi, type User } from '@/lib/api';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  login: (email: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null,
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  isLoading: false,

  login: async (email: string) => {
    set({ isLoading: true });
    try {
      const response = await authApi.post('/auth/login', { email });
      const { accessToken, refreshToken } = response.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      set({ accessToken, refreshToken });
      await get().fetchUser();
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Login failed');
    } finally {
      set({ isLoading: false });
    }
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    set({ user: null, accessToken: null, refreshToken: null });
  },

  fetchUser: async () => {
    try {
      const response = await authApi.get('/auth/me');
      const user = response.data.user;
      localStorage.setItem('user', JSON.stringify(user));
      set({ user });
    } catch (error) {
      get().logout();
    }
  },
}));

