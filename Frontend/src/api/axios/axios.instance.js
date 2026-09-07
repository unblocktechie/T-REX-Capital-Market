import axios from 'axios';
import { env } from '@/config/env';

export const apiClient = axios.create({
  baseURL: `${env.apiBaseUrl}/${env.apiVersion}`,
  timeout: env.requestTimeout,
  withCredentials: false,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});
