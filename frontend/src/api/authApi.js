import { apiRequest } from './apiClient';

export function login(username, password) {
  return apiRequest('/auth/login', { method: 'POST', body: { username, password }, auth: false });
}

export function register(payload) {
  return apiRequest('/auth/register', { method: 'POST', body: payload, auth: false });
}

export function logout() {
  return apiRequest('/auth/logout', { method: 'POST' });
}
