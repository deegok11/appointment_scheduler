import { apiRequest } from './apiClient';

export function getMyAppointments(startDatetime, endDatetime) {
  const params = new URLSearchParams({ start_datetime: startDatetime, end_datetime: endDatetime });
  return apiRequest(`/doctors/me/appointments?${params.toString()}`, { method: 'GET' });
}
