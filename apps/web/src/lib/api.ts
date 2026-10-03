const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

export async function apiFetch<T = any>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('gym_app_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const { timeoutMs = 15000, signal: externalSignal, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 && typeof window !== 'undefined') {
        localStorage.removeItem('gym_app_token');
        window.dispatchEvent(new CustomEvent('gym_app_auth_expired'));
      }
      const errorBody = await response.json().catch(() => ({}));
      const message = errorBody?.message || errorBody?.error || `درخواست با خطای کد ${response.status} مواجه شد`;
      throw new Error(Array.isArray(message) ? message.join('، ') : message);
    }

    return await response.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('مهلت زمانی ارتباط با سرور به پایان رسید. لطفاً وضعیت شبکه خود را بررسی نموده و مجدداً تلاش کنید.');
    }
    if (err.message === 'Failed to fetch' || err.message?.includes('NetworkError') || err.message?.includes('fetch failed')) {
      throw new Error('خطا در برقراری ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی نمایید.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

