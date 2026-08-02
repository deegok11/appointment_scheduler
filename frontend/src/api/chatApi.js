import { apiRequest } from './apiClient';

export function sendMessage(message, sessionId) {
  return apiRequest('/chat', { method: 'POST', body: { message, session_id: sessionId } });
}
