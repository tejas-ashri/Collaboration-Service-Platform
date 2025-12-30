import { create } from 'zustand';
import { projectsApi, type Project, type Collaborator } from '@/lib/api';

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  fetchProjects: () => Promise<void>;
  createProject: (name: string) => Promise<Project>;
  updateProject: (id: string, name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  addCollaborator: (projectId: string, userId: string, role: Collaborator['role']) => Promise<void>;
  removeCollaborator: (projectId: string, collaboratorId: string) => Promise<void>;
  fetchCollaborators: (projectId: string) => Promise<Collaborator[]>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  isLoading: false,

  fetchProjects: async () => {
    set({ isLoading: true });
    try {
      const response = await projectsApi.get('/projects', {
        params: { limit: 100 },
      });
      set({ projects: response.data.items });
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  createProject: async (name: string) => {
    try {
      const response = await projectsApi.post('/projects', { name });
      const newProject = response.data;
      set((state) => ({ projects: [...state.projects, newProject] }));
      return newProject;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to create project');
    }
  },

  updateProject: async (id: string, name: string) => {
    try {
      await projectsApi.put(`/projects/${id}`, { name });
      set((state) => ({
        projects: state.projects.map((p) =>
          p._id === id || p.id === id ? { ...p, name } : p
        ),
        currentProject:
          state.currentProject && (state.currentProject._id === id || state.currentProject.id === id)
            ? { ...state.currentProject, name }
            : state.currentProject,
      }));
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to update project');
    }
  },

  deleteProject: async (id: string) => {
    try {
      await projectsApi.delete(`/projects/${id}`);
      set((state) => ({
        projects: state.projects.filter((p) => p._id !== id && p.id !== id),
        currentProject: state.currentProject && (state.currentProject._id === id || state.currentProject.id === id)
          ? null
          : state.currentProject,
      }));
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to delete project');
    }
  },

  fetchProject: async (id: string) => {
    set({ isLoading: true });
    try {
      const response = await projectsApi.get(`/projects/${id}`);
      set({ currentProject: response.data });
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch project');
    } finally {
      set({ isLoading: false });
    }
  },

  addCollaborator: async (projectId: string, userId: string, role: Collaborator['role']) => {
    try {
      await projectsApi.post(`/projects/${projectId}/collaborators`, { userId, role });
      await get().fetchProject(projectId);
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to add collaborator');
    }
  },

  removeCollaborator: async (projectId: string, collaboratorId: string) => {
    try {
      await projectsApi.delete(`/projects/${projectId}/collaborators/${collaboratorId}`);
      await get().fetchProject(projectId);
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to remove collaborator');
    }
  },

  fetchCollaborators: async (projectId: string) => {
    try {
      const response = await projectsApi.get(`/projects/${projectId}/collaborators`);
      return response.data.collaborators;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch collaborators');
    }
  },
}));

