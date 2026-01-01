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
      if (!accessToken || !refreshToken) {
        throw new Error('Invalid response from server: missing tokens');
      }
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      set({ accessToken, refreshToken });
      await get().fetchUser();
    } catch (error: any) {
      // Better error handling with more details
      if (error.response) {
        // Server responded with error status
        const errorMessage = error.response.data?.error || error.response.data?.message || 'Login failed';
        const errorDetails = error.response.data?.details;
        const fullError = errorDetails ? `${errorMessage}: ${JSON.stringify(errorDetails)}` : errorMessage;
        throw new Error(fullError);
      } else if (error.request) {
        // Request was made but no response received
        throw new Error('Unable to connect to server. Please check if the backend is running.');
      } else {
        // Error setting up the request
        throw new Error(error.message || 'Login failed');
      }
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

