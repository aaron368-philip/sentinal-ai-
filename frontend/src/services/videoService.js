import api from './api';

export const videoService = {
  uploadVideo: async (formData, onUploadProgress) => {
    const response = await api.post('/videos/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onUploadProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onUploadProgress(percentCompleted);
        }
      },
    });
    return response.data;
  },

  getVideos: async (cameraId = null) => {
    const params = cameraId ? { camera_id: cameraId } : {};
    const response = await api.get('/videos', { params });
    return response.data;
  },

  getVideoById: async (videoId) => {
    const response = await api.get(`/videos/${videoId}`);
    return response.data;
  },

  getVideoStreamUrl: (videoId) => {
    return `/api/v1/videos/${videoId}/stream`;
  },

  getCameras: async () => {
    const response = await api.get('/cameras');
    return response.data;
  },

  createCamera: async (cameraData) => {
    const response = await api.post('/cameras', cameraData);
    return response.data;
  }
};
