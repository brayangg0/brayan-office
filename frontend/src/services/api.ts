import axios from 'axios';

const api = axios.create({ baseURL: '/api' });


export default api;

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface Contact {
  id: string; name: string; phone: string; email?: string;
  status: string; tags: string; notes?: string; createdAt: string;
  student?: { id: string; status: string; course?: { name: string } } | null;
}

export interface Student {
  id: string; contactId: string; contact: Contact; courseId?: string;
  course?: Course; cpf?: string; rg?: string; status: string;
  enrolledAt: string; expiresAt?: string; rgPhotoPath?: string; rgDataExtracted?: string;
}

export interface Course {
  id: string; name: string; description?: string; duration?: number; price?: number; active: boolean;
  _count?: { students: number };
}

export interface Campaign {
  id: string; name: string; description?: string; status: string;
  targetType: string; scheduledAt?: string; totalSent: number; totalFailed: number;
  template?: MessageTemplate; user?: { name: string }; createdAt: string;
}

export interface MessageTemplate {
  id: string; name: string; type: string; body?: string;
  mediaPath?: string; variables: string; active: boolean;
}

export interface ScheduledMessage {
  id: string; targetType: string; type: string; body?: string;
  scheduledAt: string; status: string; recurring: boolean; cronExpr?: string;
  user?: { name: string };
}

export interface WhatsAppGroup {
  id: string; groupId: string; name: string; members: number; active: boolean;
}

// ─── Funções da API ──────────────────────────────────────────────────────────

// Auth
export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password }).then((r) => r.data);

export const register = (name: string, email: string, password: string) =>
  api.post('/auth/register', { name, email, password }).then((r) => r.data);

export const getMe = () => api.get('/auth/me').then((r) => r.data);

// Contatos
export const getContacts = (params?: any) => api.get('/contacts', { params }).then((r) => r.data);
export const getContact = (id: string) => api.get(`/contacts/${id}`).then((r) => r.data);
export const createContact = (data: any) => api.post('/contacts', data).then((r) => r.data);
export const updateContact = (id: string, data: any) => api.put(`/contacts/${id}`, data).then((r) => r.data);
export const deleteContact = (id: string) => api.delete(`/contacts/${id}`);
export const importContacts = (contacts: any[]) => api.post('/contacts/import', { contacts }).then((r) => r.data);
export const importContactsCsv = (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post('/contacts/import-csv', fd).then((r) => r.data);
};

// Alunos
export const getStudents = (params?: any) => api.get('/students', { params }).then((r) => r.data);
export const getStudent = (id: string) => api.get(`/students/${id}`).then((r) => r.data);
export const createStudent = (data: any) => api.post('/students', data).then((r) => r.data);
export const updateStudent = (id: string, data: any) => api.put(`/students/${id}`, data).then((r) => r.data);
export const uploadStudentRg = (id: string, file: File) => {
  const fd = new FormData(); fd.append('rg', file);
  return api.post(`/students/${id}/rg`, fd).then((r) => r.data);
};

// Cursos
export const getCourses = () => api.get('/courses').then((r) => r.data);
export const createCourse = (data: any) => api.post('/courses', data).then((r) => r.data);
export const updateCourse = (id: string, data: any) => api.put(`/courses/${id}`, data).then((r) => r.data);
export const deleteCourse = (id: string) => api.delete(`/courses/${id}`);

// Campanhas
export const getCampaigns = (params?: any) => api.get('/campaigns', { params }).then((r) => r.data);
export const getCampaign = (id: string) => api.get(`/campaigns/${id}`).then((r) => r.data);
export const createCampaign = (data: any) => api.post('/campaigns', data).then((r) => r.data);
export const updateCampaign = (id: string, data: any) => api.put(`/campaigns/${id}`, data).then((r) => r.data);
export const sendCampaign = (id: string) => api.post(`/campaigns/${id}/send`).then((r) => r.data);
export const scheduleCampaign = (id: string, scheduledAt: string) => api.post(`/campaigns/${id}/schedule`, { scheduledAt }).then((r) => r.data);

// Templates
export const getTemplates = () => api.get('/templates').then((r) => r.data);
export const createTemplate = (fd: FormData) => api.post('/templates', fd).then((r) => r.data);
export const updateTemplate = (id: string, fd: FormData) => api.put(`/templates/${id}`, fd).then((r) => r.data);

// WhatsApp
export const getWhatsAppStatus = () => api.get('/whatsapp/status').then((r) => r.data);
export const getQrCode = () => api.get('/whatsapp/qr').then((r) => r.data);
export const sendMessage = (fd: FormData) => api.post('/whatsapp/send', fd).then((r) => r.data);
export const getGroups = () => api.get('/whatsapp/groups').then((r) => r.data);
export const syncGroups = () => api.post('/whatsapp/groups/sync').then((r) => r.data);
export const syncChats = () => api.post('/whatsapp/chats/sync').then((r) => r.data);
export const toggleWhatsAppGroup = (id: string) => api.post(`/whatsapp/groups/${id}/toggle`).then((r) => r.data);
export const restartWhatsApp = () => api.post('/whatsapp/restart').then((r) => r.data);
export const logoutWhatsApp = () => api.post('/whatsapp/logout').then((r) => r.data);

// Automação - AutoResponse
export const getAutoResponseStatus = () => api.get('/automation/autoresponse/status').then((r) => r.data);
export const getAutoResponseTemplates = () => api.get('/automation/autoresponse/templates').then((r) => r.data);
export const createAutoResponseTemplate = (data: any) => api.post('/automation/autoresponse/template', data).then((r) => r.data);
export const updateAutoResponseTemplate = (id: string, data: any) => api.put(`/automation/autoresponse/template/${id}`, data).then((r) => r.data);
export const deleteAutoResponseTemplate = (id: string) => api.delete(`/automation/autoresponse/template/${id}`).then((r) => r.data);

// Automação - Campanhas Agendadas
export const getAutomationCampaigns = (params?: any) => api.get('/automation/campaigns', { params }).then((r) => r.data);
export const createAutomationCampaign = (data: any) => api.post('/automation/campaigns', data).then((r) => r.data);
export const sendAutomationCampaignNow = (id: string) => api.post(`/automation/campaigns/${id}/send`, { sendNow: true }).then((r) => r.data);
export const deleteAutomationCampaign = (id: string) => api.delete(`/automation/campaigns/${id}`).then((r) => r.data);

// Automação - Mensagens Agendadas
export const getScheduledMessages = (params?: any) => api.get('/automation/scheduled-messages', { params }).then((r) => r.data);
export const createScheduledMessage = (data: any) => api.post('/automation/scheduled-messages', data).then((r) => r.data);
export const cancelScheduledMessage = (id: string) => api.post(`/automation/scheduled-messages/${id}/cancel`).then((r) => r.data);

// Agendamentos
export const getSchedules = (params?: any) => api.get('/schedules', { params }).then((r) => r.data);
export const createSchedule = (fd: FormData) => api.post('/schedules', fd).then((r) => r.data);
export const cancelSchedule = (id: string) => api.delete(`/schedules/${id}`);

// Mensagens
export const getMessages = (params?: any) => api.get('/messages', { params }).then((r) => r.data);
