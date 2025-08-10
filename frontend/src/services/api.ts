import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface User {
  id: string;
  username: string;
  role: 'head_admin' | 'admin' | 'msu' | 'storage' | 'surgery';
}

export interface MedicalItem {
  id: string;
  company_prefix: string;
  serial_number: number;
  item_name: string;
  location: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface InstrumentGroup {
  id: string;
  name: string;
  location: string;
  created_at: string;
  GroupItems?: Array<{ item_id: string; MedicalItem: MedicalItem }>;
}

export interface ActionHistory {
  id: string;
  item_id: string;
  item_name: string;
  company_prefix: string;
  action: string;
  from_location: string;
  to_location: string;
  performed_by: string;
  performed_by_username?: string;
  performed_by_role?: string;
  timestamp: string;
  User?: {
    username: string;
    role: string;
  };
  MedicalItem?: MedicalItem;
}

export interface ForwardingRequest {
  id: string;
  group_id: string;
  from_location: string;
  to_location: string;
  status: 'pending' | 'accepted' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  InstrumentGroup?: InstrumentGroup;
}

export interface StoragePosition {
  id: string;
  item_id: string;
  item_name: string;
  item_type: 'Item' | 'Group';
  position: string;
  stored_by: string;
  created_at: string;
}

export const authAPI = {
  login: (username: string, password: string) => api.post('/auth/login', { username, password }),
  setPassword: (userId: string, password: string) => api.post('/auth/set-password', { userId, password }),
  getUsers: () => api.get('/auth/users'),
  createUser: (username: string, role: string) => api.post('/auth/users', { username, role }),
  updateUser: (id: string, data: { username?: string; role?: string }) => api.put(`/auth/users/${id}`, data),
  deleteUser: (id: string) => api.delete(`/auth/users/${id}`),
};

export const itemsAPI = {
  getAll: (page?: number, pageSize?: number, filters?: { company?: string; itemType?: string; userRole?: string }) => api.get<{ data: MedicalItem[]; pagination: { currentPage: number; pageSize: number; totalItems: number; totalPages: number } }>('/items', { params: { page, pageSize, ...filters } }),
  register: (company_prefix: string, item_name: string, quantity: number) =>
    api.post('/items/register', { company_prefix, item_name, quantity }),
  updateStatus: (id: string, location: string, action: string) =>
    api.put(`/items/${id}/status`, { location, action }),
  bulkUpdateStatus: (itemIds: string[], location: string, action: string) =>
    api.put('/items/bulk-status', { itemIds, location, action }),
  getById: (id: string) => api.get<MedicalItem>(`/items/${id}`),
  delete: (id: string) => api.delete(`/items/${id}`),
  clearAll: () => api.delete('/items/clear/all'),
  getStatus: (id: string) => api.get(`/items/${id}/status`),
};

export const groupsAPI = {
  getAll: () => api.get<InstrumentGroup[]>('/groups'),
  getById: (id: string) => api.get<InstrumentGroup>(`/groups/${id}`),
  create: (name: string, itemIds: string[]) => api.post('/groups', { name, itemIds }),
  updateLocation: (id: string, location: string) => api.put(`/groups/${id}/location`, { location }),
  delete: (id: string) => api.delete(`/groups/${id}`),
  removeItemFromGroup: (groupId: string, itemId: string) => api.delete(`/groups/${groupId}/items/${itemId}`),
  getSterilizableItems: (id: string) => api.get<MedicalItem[]>(`/groups/${id}/sterilizable-items`),
  getAvailableItems: (role: string, filters?: { brand?: string; type?: string; status?: string }) =>
    api.get<MedicalItem[]>(`/groups/available-items/${role}`, { params: filters }),
};

export const historyAPI = {
  getAll: (params?: { action?: string; itemId?: string; limit?: number; page?: number; pageSize?: number; userRole?: string; userId?: string }) =>
    api.get<{ data: ActionHistory[]; pagination: { currentPage: number; pageSize: number; totalItems: number; totalPages: number } }>('/history', { params }),
  clear: () => api.delete('/history/clear'),
};

export const forwardingAPI = {
  getAll: () => api.get<ForwardingRequest[]>('/forwarding'),
  getPending: () => api.get<ForwardingRequest[]>('/forwarding/pending'),
  create: (group_id: string, to_location: string) => api.post('/forwarding', { group_id, to_location }),
  accept: (id: string) => api.post(`/forwarding/${id}/accept`),
  reject: (id: string, reason?: string) => api.post(`/forwarding/${id}/reject`, { reason }),
};

export const storageAPI = {
  getAll: () => api.get<StoragePosition[]>('/storage'),
  create: (item_id: string, item_name: string, item_type: 'Item' | 'Group', position: string) =>
    api.post('/storage', { item_id, item_name, item_type, position }),
};

export const sterilizationAPI = {
  steam: (itemIds: string[], heat: number, psi: number, duration: number) =>
    api.post('/sterilization/steam', { itemIds, heat, psi, duration }),
  validateCooling: (itemIds: string[]) =>
    api.post('/sterilization/validate-cooling', { itemIds }),
};

export const exportAPI = {
  inventory: () => api.get('/export/inventory'),
  history: (params?: { action?: string; itemId?: string; userRole?: string; userId?: string }) => 
    api.get('/export/history', { params }),
};

export default api;