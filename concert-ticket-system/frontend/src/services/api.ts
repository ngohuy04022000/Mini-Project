import axios, { AxiosError } from 'axios';
import type {
  Event,
  HoldResponse,
  PaymentResponse,
  HoldStatus,
  AdminStats,
  ActiveHold,
  ApiResponse,
  TicketLookupResult,
  AddSlotsResponse,
} from '../types';
import { getSessionId } from '../utils/session';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach session ID to every request
api.interceptors.request.use((config) => {
  config.headers['x-session-id'] = getSessionId();
  return config;
});

// Global response interceptor - extract data or throw structured error
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse<unknown>>) => {
    const apiError = error.response?.data?.error;
    if (apiError) {
      const err = new Error(apiError.message) as Error & { code: string; statusCode: number };
      err.code = apiError.code;
      err.statusCode = error.response?.status ?? 500;
      return Promise.reject(err);
    }
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('Yêu cầu quá thời gian. Vui lòng thử lại.'));
    }
    if (!error.response) {
      return Promise.reject(new Error('Không thể kết nối đến server. Kiểm tra kết nối mạng.'));
    }
    return Promise.reject(error);
  },
);

export async function fetchActiveEvent(): Promise<Event> {
  const { data } = await api.get<ApiResponse<Event>>('/events/active');
  return data.data!;
}

export async function holdTicket(params: {
  ticketTypeId: string;
  quantity: number;
}): Promise<HoldResponse> {
  const { data } = await api.post<ApiResponse<HoldResponse>>('/tickets/hold', {
    ...params,
    sessionId: getSessionId(),
  });
  return data.data!;
}

export async function releaseHold(holdId: string): Promise<void> {
  await api.post('/tickets/release', { holdId, sessionId: getSessionId() });
}

/**
 * Best-effort hold release that survives the page being closed/navigated away.
 * Uses the Beacon API so the request is queued by the browser even during unload.
 */
export function releaseHoldBeacon(holdId: string): void {
  try {
    const payload = JSON.stringify({ holdId, sessionId: getSessionId() });
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon('/api/tickets/release', blob);
  } catch {
    // Beacon is best-effort; the hold will still expire server-side after 5 minutes.
  }
}

export async function lookupTicket(ticketCode: string): Promise<TicketLookupResult> {
  const { data } = await api.get<ApiResponse<TicketLookupResult>>(
    `/tickets/lookup/${encodeURIComponent(ticketCode.trim())}`,
  );
  return data.data!;
}

export async function getHoldStatus(holdId: string): Promise<HoldStatus> {
  const { data } = await api.get<ApiResponse<HoldStatus>>(
    `/tickets/hold/${holdId}/status?sessionId=${getSessionId()}`,
  );
  return data.data!;
}

export async function processPayment(params: {
  holdId: string;
  customerName: string;
  customerEmail: string;
}): Promise<PaymentResponse> {
  const { data } = await api.post<ApiResponse<PaymentResponse>>('/payments/process', {
    ...params,
    sessionId: getSessionId(),
  });
  return data.data!;
}

// Admin key is optional: set VITE_ADMIN_API_KEY in frontend/.env.local to match
// the server's ADMIN_API_KEY. If neither is set, admin routes are open (dev mode).
const ADMIN_KEY = import.meta.env.VITE_ADMIN_API_KEY as string | undefined;
const adminHeaders = ADMIN_KEY ? { 'x-admin-key': ADMIN_KEY } : {};

export async function fetchAdminStats(): Promise<AdminStats> {
  const { data } = await api.get<ApiResponse<AdminStats>>('/admin/stats', { headers: adminHeaders });
  return data.data!;
}

export async function fetchActiveHolds(): Promise<ActiveHold[]> {
  const { data } = await api.get<ApiResponse<ActiveHold[]>>('/admin/holds', { headers: adminHeaders });
  return data.data!;
}

export async function addTicketSlots(
  ticketTypeId: string,
  additionalSlots: number,
): Promise<AddSlotsResponse> {
  const { data } = await api.post<ApiResponse<AddSlotsResponse>>(
    `/admin/ticket-types/${ticketTypeId}/slots`,
    { additionalSlots },
    { headers: adminHeaders },
  );
  return data.data!;
}
