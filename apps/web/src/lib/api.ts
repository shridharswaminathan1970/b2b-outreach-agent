// Axios API client. The backend returns { success, data, meta? } / { success:false,
// error }. This unwraps `data`, stores the access token in memory (+ refresh in
// localStorage), and transparently refreshes on a 401 once.
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

const REFRESH_KEY = 'outreach.refreshToken';

// API base. With VITE_API_URL set at build time (e.g. on Railway, where the SPA
// and API are separate services), call the API directly at its public origin;
// otherwise use a same-origin "/api" path (nginx proxy in prod, Vite proxy in dev).
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function setRefreshToken(token: string | null): void {
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}

export const http: AxiosInstance = axios.create({ baseURL: API_BASE });

http.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
    const data = res.data?.data ?? res.data;
    const newAccess: string = data.accessToken;
    setAccessToken(newAccess);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    return newAccess;
  } catch {
    setAccessToken(null);
    setRefreshToken(null);
    return null;
  }
}

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as AxiosRequestConfig & { _retried?: boolean };
    const status = error.response?.status;
    if (status === 401 && original && !original._retried && getRefreshToken()) {
      original._retried = true;
      refreshing = refreshing ?? refreshAccessToken();
      const token = await refreshing;
      refreshing = null;
      if (token) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${token}`;
        return http(original);
      }
    }
    return Promise.reject(error);
  },
);

// Normalized error message from the API envelope.
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error?.message ?? err.message ?? 'Request failed';
  }
  return err instanceof Error ? err.message : 'Request failed';
}

// Typed helpers that unwrap the { data } / { data, meta } envelope.
export interface Paginated<T> {
  items: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.get(url, config);
  return (res.data?.data ?? res.data) as T;
}

// List endpoints return data as an array + meta.pagination.
export async function apiList<T>(url: string, config?: AxiosRequestConfig): Promise<Paginated<T>> {
  const res = await http.get(url, config);
  return {
    items: (res.data?.data ?? []) as T[],
    pagination: res.data?.meta?.pagination ?? { page: 1, limit: 0, total: 0, totalPages: 0 },
  };
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.post(url, body);
  return (res.data?.data ?? res.data) as T;
}
export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.patch(url, body);
  return (res.data?.data ?? res.data) as T;
}
export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.put(url, body);
  return (res.data?.data ?? res.data) as T;
}
export async function apiDelete<T>(url: string): Promise<T> {
  const res = await http.delete(url);
  return (res.data?.data ?? res.data) as T;
}
