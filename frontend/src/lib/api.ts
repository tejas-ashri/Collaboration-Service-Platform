import axios, { AxiosInstance } from 'axios';

const API_BASE_URLS = {
  auth: 'http://localhost:4000',
  projects: 'http://localhost:4001',
  collab: 'http://localhost:4002',
  files: 'http://localhost:4003',
  ai: 'http://localhost:4004',
};

export const createApiClient = (baseURL: string): AxiosInstance => {
  const client = axios.create({ baseURL });
  
  client.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          try {
            const response = await axios.post(`${API_BASE_URLS.auth}/auth/refresh`, {
              refreshToken,
            });
            localStorage.setItem('accessToken', response.data.accessToken);
            localStorage.setItem('refreshToken', response.data.refreshToken);
            error.config.headers.Authorization = `Bearer ${response.data.accessToken}`;
            return axios.request(error.config);
          } catch {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            window.location.href = '/login';
          }
        } else {
          window.location.href = '/login';
        }
      }
      return Promise.reject(error);
    }
  );

  return client;
};

export const authApi = createApiClient(API_BASE_URLS.auth);
export const projectsApi = createApiClient(API_BASE_URLS.projects);
export const collabApi = createApiClient(API_BASE_URLS.collab);
export const filesApi = createApiClient(API_BASE_URLS.files);
export const aiApi = createApiClient(API_BASE_URLS.ai);

export interface LoginRequest {
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
}

export interface User {
  sub: string;
  roles: string[];
}

export interface Project {
  _id: string;
  id?: string;
  name: string;
  ownerId: string;
  collaborators: Collaborator[];
  createdAt: string;
  updatedAt: string;
}

export interface Collaborator {
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface FileMeta {
  _id: string;
  projectId: string;
  path: string;
  contentType?: string;
  contentLength?: number;
  ownerId?: string;
  updatedAt: string;
}

export interface Snapshot {
  _id: string;
  projectId: string;
  userId?: string;
  content: string;
  createdAt: string;
}

