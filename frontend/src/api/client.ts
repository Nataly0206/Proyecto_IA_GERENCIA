import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  timeout: 60000,
  headers: import.meta.env.VITE_API_KEY
    ? { 'X-API-Key': import.meta.env.VITE_API_KEY }
    : undefined,
});
