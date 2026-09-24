// utils/apiConfig.js
// URL única del backend. Se define con EXPO_PUBLIC_API_URL en producción.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://unibackend-production-a0f8.up.railway.app';

const BOT_URL = `${API_BASE_URL}/bot`;

export { API_BASE_URL, BOT_URL };