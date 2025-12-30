import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { filesApi, collabApi, aiApi } from '@/lib/api';
import {
  ArrowLeft,
  Save,
  Users,
  UserPlus,
  X,
  File,
  Upload,
  Trash2,
  Sparkles,
  Download,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface CursorPosition {
  userId: string;
  x: number;
  y: number;
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, accessToken } = useAuthStore();
  const { currentProject, fetchProject, updateProject, fetchCollaborators } = useProjectStore();
  const [content, setContent] = useState('');
  const [cursors, setCursors] = useState<Map<string, CursorPosition>>(new Map());
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showAddCollaborator, setShowAddCollaborator] = useState(false);
  const [newCollaboratorEmail, setNewCollaboratorEmail] = useState('');
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!id) return;
    fetchProject(id);
    fetchCollaborators(id).then(setCollaborators);
    fetchFiles();
    loadSnapshot();
  }, [id, fetchProject, fetchCollaborators]);

  useEffect(() => {
    if (!id || !accessToken || !user) return;

    const socket = io('http://localhost:4002', {
      auth: { token: accessToken },
      query: { projectId: id },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to collaboration server');
    });

    socket.on('cursor', (data: CursorPosition) => {
      setCursors((prev) => {
        const newMap = new Map(prev);
        newMap.set(data.userId, data);
        return newMap;
      });
      setTimeout(() => {
        setCursors((prev) => {
          const newMap = new Map(prev);
          newMap.delete(data.userId);
          return newMap;
        });
      }, 2000);
    });

    socket.on('op', (data: { userId: string; delta: any }) => {
      // Handle operational transforms for real-time editing
      // For simplicity, we'll just update content
      if (data.userId !== user?.sub) {
        // Apply delta to content
      }
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from collaboration server');
    });

    return () => {
      socket.disconnect();
    };
  }, [id, accessToken, user]);

  useEffect(() => {
    if (!id) return;
    fetchPresence();
    const interval = setInterval(fetchPresence, 5000);
    return () => clearInterval(interval);
  }, [id]);

  const fetchPresence = async () => {
    try {
      const response = await collabApi.get(`/presence/${id}`);
      setOnlineUsers(response.data.users);
    } catch (error) {
      console.error('Failed to fetch presence:', error);
    }
  };

  const fetchFiles = async () => {
    if (!id) return;
    try {
      const response = await filesApi.get('/files', {
        params: { projectId: id, limit: 100 },
      });
      setFiles(response.data.items || []);
    } catch (error) {
      console.error('Failed to fetch files:', error);
    }
  };

  const loadSnapshot = async () => {
    if (!id) return;
    try {
      const response = await collabApi.get(`/snapshots/${id}`);
      setContent(response.data.content || '');
    } catch (error) {
      console.error('Failed to load snapshot:', error);
    }
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    if (socketRef.current) {
      socketRef.current.emit('op', { delta: { type: 'update', content: newContent } });
    }
  };

  const handleSave = async () => {
    if (!id) return;
    try {
      if (socketRef.current) {
        socketRef.current.emit('snapshot', { content });
      }
      toast.success('Saved!');
    } catch (error) {
      toast.error('Failed to save');
    }
  };

  const handleAddCollaborator = async () => {
    if (!id) return;
    try {
      await useProjectStore.getState().addCollaborator(id, newCollaboratorEmail, 'editor');
      toast.success('Collaborator added!');
      setNewCollaboratorEmail('');
      setShowAddCollaborator(false);
      const updated = await fetchCollaborators(id);
      setCollaborators(updated);
    } catch (error: any) {
      toast.error(error.message || 'Failed to add collaborator');
    }
  };

  const handleRemoveCollaborator = async (collaboratorId: string) => {
    if (!id) return;
    try {
      await useProjectStore.getState().removeCollaborator(id, collaboratorId);
      toast.success('Collaborator removed');
      const updated = await fetchCollaborators(id);
      setCollaborators(updated);
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove collaborator');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    try {
      const presignResponse = await filesApi.post('/files/presign', {
        projectId: id,
        path: file.name,
        operation: 'upload',
        contentType: file.type,
        contentLength: file.size,
      });

      await fetch(presignResponse.data.url, {
        method: 'PUT',
        body: file,
        headers: presignResponse.data.headers,
      });

      toast.success('File uploaded!');
      fetchFiles();
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload file');
    }
  };

  const handleFileDelete = async (filePath: string) => {
    if (!id) return;
    if (!window.confirm('Delete this file?')) return;

    try {
      await filesApi.delete('/files', {
        params: { projectId: id, path: filePath },
      });
      toast.success('File deleted');
      fetchFiles();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete file');
    }
  };

  const handleAISuggest = async () => {
    if (!aiPrompt) return;
    try {
      const response = await aiApi.post('/ai/suggest', { prompt: aiPrompt });
      setAiSuggestion(response.data.suggestion);
    } catch (error: any) {
      toast.error(error.message || 'Failed to get AI suggestion');
    }
  };

  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">{currentProject.name}</h1>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>{onlineUsers.length} online</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAIPanel(!showAIPanel)}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                AI
              </button>
              <button
                onClick={handleSave}
                className="btn btn-primary flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
              <button
                onClick={() => setShowCollaborators(true)}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                Collaborators
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex">
        <main className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            <textarea
              ref={editorRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              onMouseMove={(e) => {
                if (socketRef.current && editorRef.current) {
                  const rect = editorRef.current.getBoundingClientRect();
                  socketRef.current.emit('cursor', {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                  });
                }
              }}
              className="w-full h-full min-h-[600px] p-6 bg-white rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none font-mono text-sm"
              placeholder="Start typing... Your changes will be synced in real-time with other collaborators."
            />
          </div>
        </main>

        <aside className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <File className="w-4 h-4" />
                Files
              </h3>
              <label className="btn btn-secondary w-full flex items-center justify-center gap-2 mb-4 cursor-pointer">
                <Upload className="w-4 h-4" />
                Upload File
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file._id}
                    className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg"
                  >
                    <span className="text-sm text-gray-700 truncate flex-1">{file.path}</span>
                    <button
                      onClick={() => handleFileDelete(file.path)}
                      className="p-1 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {showCollaborators && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="card w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Collaborators</h3>
              <button
                onClick={() => {
                  setShowCollaborators(false);
                  setShowAddCollaborator(false);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 mb-4">
              {collaborators.map((collab) => (
                <div
                  key={collab.userId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                      <Users className="w-4 h-4 text-primary-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{collab.userId}</p>
                      <p className="text-xs text-gray-500">{collab.role}</p>
                    </div>
                  </div>
                  {collab.userId !== user?.sub && collab.role !== 'owner' && (
                    <button
                      onClick={() => handleRemoveCollaborator(collab.userId)}
                      className="p-2 hover:bg-red-50 rounded-lg"
                    >
                      <X className="w-4 h-4 text-red-600" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!showAddCollaborator ? (
              <button
                onClick={() => setShowAddCollaborator(true)}
                className="btn btn-primary w-full flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Add Collaborator
              </button>
            ) : (
              <div className="space-y-3">
                <input
                  type="email"
                  value={newCollaboratorEmail}
                  onChange={(e) => setNewCollaboratorEmail(e.target.value)}
                  className="input"
                  placeholder="user@example.com"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowAddCollaborator(false);
                      setNewCollaboratorEmail('');
                    }}
                    className="btn btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button onClick={handleAddCollaborator} className="btn btn-primary flex-1">
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showAIPanel && (
        <div className="fixed right-0 top-16 bottom-0 w-96 bg-white border-l border-gray-200 shadow-xl z-40 p-6 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary-600" />
              AI Assistant
            </h3>
            <button
              onClick={() => setShowAIPanel(false)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ask AI for suggestions
              </label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                className="input min-h-[100px]"
                placeholder="Describe what you need help with..."
              />
              <button
                onClick={handleAISuggest}
                className="btn btn-primary w-full mt-2"
              >
                Get Suggestion
              </button>
            </div>
            {aiSuggestion && (
              <div className="p-4 bg-primary-50 rounded-lg">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{aiSuggestion}</p>
                <button
                  onClick={() => {
                    setContent(content + '\n\n' + aiSuggestion);
                    setAiSuggestion('');
                  }}
                  className="btn btn-primary w-full mt-3"
                >
                  Insert into Editor
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

