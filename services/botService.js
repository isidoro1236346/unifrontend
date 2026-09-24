// services/botService.js
import axios from 'axios';
import { BOT_URL } from '../utils/apiConfig';

const API = axios.create({
  baseURL: BOT_URL,
  timeout: 40000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const BotService = {
  sendMessage: async (message, sender = 'invitado') => {
    const response = await API.post('/chat', { message, sender });
    return response.data;
  },

  getHistory: async (sender = 'invitado') => {
    try {
      const response = await API.get(`/history/${encodeURIComponent(sender)}`);
      return response.data;
    } catch (error) {
      console.warn('[BotService] Error al obtener historial:', error.message);
      return { messages: [] };
    }
  },

  getStatus: async () => {
    const response = await API.get('/status');
    return response.data;
  },
};