import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sentinel_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

// Redirect to login on 401 (except for login attempts)
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('sentinel_token');
      localStorage.removeItem('sentinel_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (username, password) =>
    api.post('/auth/token', new URLSearchParams({ username, password }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  me: () => api.get('/auth/me'),
};

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
  getAlerts: () => api.get('/dashboard/alerts'),
  getTimeline: () => api.get('/dashboard/timeline'),
};

// ─── Buildings ───────────────────────────────────────────────────────────────
export const buildingsAPI = {
  list: () => api.get('/buildings'),
  get: (id) => api.get(`/buildings/${id}`),
  create: (payload) => api.post('/buildings', payload),
  update: (id, payload) => api.patch(`/buildings/${id}`, payload),
  delete: (id) => api.delete(`/buildings/${id}`),
};

// ─── Floors ──────────────────────────────────────────────────────────────────
export const floorsAPI = {
  list: (buildingId) => api.get('/floors', { params: buildingId ? { building_id: buildingId } : {} }),
  get: (id) => api.get(`/floors/${id}`),
  create: (payload) => api.post('/floors', payload),
  uploadBlueprint: (floorId, formData) =>
    api.post(`/floors/${floorId}/blueprint`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  blueprintUrl: (floorId) => `${API_BASE_URL}/floors/${floorId}/blueprint-file`,
  update: (id, payload) => api.patch(`/floors/${id}`, payload),
  delete: (id) => api.delete(`/floors/${id}`),
};

// ─── Camera Connections ──────────────────────────────────────────────────────
export const cameraConnectionsAPI = {
  list: (buildingId) => api.get('/camera-connections', { params: buildingId ? { building_id: buildingId } : {} }),
  create: (payload) => api.post('/camera-connections', payload),
  delete: (id) => api.delete(`/camera-connections/${id}`),
};

// ─── Cameras ─────────────────────────────────────────────────────────────────
export const camerasAPI = {
  list: (params) => {
    if (typeof params === 'string') params = { building_id: params };
    return api.get('/cameras', { params });
  },
  get: (id) => api.get(`/cameras/${id}`),
  create: (payload) => api.post('/cameras', payload),
  update: (id, payload) => api.patch(`/cameras/${id}`, payload),
  delete: (id) => api.delete(`/cameras/${id}`),
  reorder: (cameras) => api.post('/cameras/reorder', { cameras }),
};

// ─── Videos ──────────────────────────────────────────────────────────────────
export const videosAPI = {
  list: (cameraId) => api.get('/videos', { params: cameraId ? { camera_id: cameraId } : {} }),
  get: (id) => api.get(`/videos/${id}`),
  status: (id) => api.get(`/videos/${id}/status`),
  probeMetadata: (formData) =>
    api.post('/videos/probe-metadata', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  upload: (formData) =>
    api.post('/videos/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getAvailableModels: () => api.get('/videos/available-models'),
  processAI: (id, modelName, targetClasses = 'person_and_bags', sampleFps = 3, imgsz = 960) =>
    api.post(`/videos/${id}/process-ai`, null, {
      params: {
        ...(modelName ? { model_name: modelName } : {}),
        ...(targetClasses ? { target_classes: targetClasses } : {}),
        ...(sampleFps ? { sample_fps: sampleFps } : {}),
        ...(imgsz ? { imgsz } : {}),
      },
    }),
  stopProcessing: (id) => api.post(`/videos/${id}/stop-processing`),
  delete: (id) => api.delete(`/videos/${id}`),
  getDetections: (id, className) =>
    api.get(`/videos/${id}/detections`, { params: className ? { class_name: className } : {} }),
  streamUrl: (id) => `/api/v1/videos/${id}/stream`,
};

// ─── Subjects ─────────────────────────────────────────────────────────────────
export const subjectsAPI = {
  list: () => api.get('/subjects'),
  get: (id) => api.get(`/subjects/${id}`),
  create: (formData) =>
    api.post('/subjects', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete: (id) => api.delete(`/subjects/${id}`),
  getCameraMatches: (id) => api.get(`/subjects/${id}/camera-matches`),
  thumbnailUrl: (id) => `/api/v1/subjects/${id}/thumbnail`,
};

// ─── Evidence Vault ───────────────────────────────────────────────────────────
export const evidenceAPI = {
  list: (params) => api.get('/evidence', { params }),
  get: (id) => api.get(`/evidence/${id}`),
  verify: (id) => api.post(`/evidence/${id}/verify`),
  preview: (id) => api.get(`/evidence/${id}/preview`),
  downloadUrl: (id) => `/api/v1/evidence/${id}/download`,
  delete: (id) => api.delete(`/evidence/${id}`),
};

// ─── Cases & Investigations ───────────────────────────────────────────────────
export const casesAPI = {
  list: (status) => api.get('/cases', { params: status ? { status } : {} }),
  get: (id) => api.get(`/cases/${id}`),
  create: (payload) => api.post('/cases', payload),
  update: (id, payload) => api.patch(`/cases/${id}`, payload),
  delete: (id) => api.delete(`/cases/${id}`),
  addEvent: (caseId, payload) => api.post(`/cases/${caseId}/events`, payload),
  linkEvidence: (caseId, evidenceId) => api.post(`/cases/${caseId}/evidence/${evidenceId}`),
};

// ─── Reports ─────────────────────────────────────────────────────────────────
export const reportsAPI = {
  list: (caseId) => api.get('/reports', { params: caseId ? { case_id: caseId } : {} }),
  get: (id) => api.get(`/reports/${id}`),
  create: (payload) => api.post('/reports', payload),
  delete: (id) => api.delete(`/reports/${id}`),
  autoGenerate: (caseId) => api.post(`/reports/auto-generate/${caseId}`),
};

// ─── AI Search ────────────────────────────────────────────────────────────────
export const aiSearchAPI = {
  searchByAttributes: (payload) => api.post('/ai-search/attribute', payload),
  describeSearch: (payload) => api.post('/ai-search/describe', payload),
  getSightingClipInfo: (trackEventId) => api.get(`/ai-search/sighting/${trackEventId}/clip-info`),
  getDetectionSummary: () => api.get('/ai-search/detections/summary'),
  getCameraActivity: () => api.get('/ai-search/cameras/activity'),
  getGeminiStatus: () => api.get('/ai-search/gemini/status'),
  classifyWithGemini: (imagePath, baseClass = 'person') =>
    api.post('/ai-search/gemini/classify-crop', { image_path: imagePath, base_class: baseClass }),
};

// ─── Tracking & MOT ──────────────────────────────────────────────────────────
export const trackingAPI = {
  getVideoTracks: (videoId, className) =>
    api.get(`/tracking/videos/${videoId}/tracks`, { params: className ? { class_name: className } : {} }),
  getTrackDetail: (videoId, trackId) =>
    api.get(`/tracking/videos/${videoId}/tracks/${trackId}`),
  getCameraRecentTracks: (cameraId) =>
    api.get(`/tracking/cameras/${cameraId}/recent`),
  getThumbnailUrl: (videoId, filename) =>
    `/api/v1/tracking/thumbnails/${videoId}/${filename}`,
};

// ─── Re-Identification (Re-ID) ───────────────────────────────────────────────
export const reidAPI = {
  matchTrack: (trackEventId, minSimilarity = 0.50) =>
    api.post(`/reid/match-track/${trackEventId}`, null, { params: { min_similarity: minSimilarity } }),
  matchSubject: (subjectId, minSimilarity = 0.50) =>
    api.post(`/reid/match-subject/${subjectId}`, null, { params: { min_similarity: minSimilarity } }),
  matchImage: (formData, minSimilarity = 0.50) =>
    api.post('/reid/match-image', formData, {
      params: { min_similarity: minSimilarity },
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getIdentities: (minSimilarity = 0.70) =>
    api.get('/reid/identities', { params: { min_similarity: minSimilarity } }),
};

// ─── Spatial Trajectories ───────────────────────────────────────────────────
export const trajectoriesAPI = {
  getTrackTrajectory: (trackEventId, minSimilarity = 0.50) =>
    api.get(`/trajectories/track/${trackEventId}`, { params: { min_similarity: minSimilarity } }),
  getSubjectTrajectory: (subjectId, minSimilarity = 0.50) =>
    api.get(`/trajectories/subject/${subjectId}`, { params: { min_similarity: minSimilarity } }),
  syncToCase: (caseId, payload) =>
    api.post(`/trajectories/sync-case/${caseId}`, payload),
};

export default api;


