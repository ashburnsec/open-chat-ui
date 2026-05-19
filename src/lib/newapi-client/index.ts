import type {
  CheckinStatus,
  LogEntry,
  LogStat,
  ModelPricing,
  NewApiResponse,
  Pagination,
  SelfUser,
  SubscriptionPlan,
  SystemStatus,
  Token,
  TopupInfo,
} from './types';

export * from './types';

export type RequestInitWithCookie = RequestInit & {
  cookie?: string;
  baseUrl?: string;
};

/**
 * Low-level fetch wrapper for new-api. Pass a `cookie` value to forward the
 * upstream session. Always returns the parsed JSON envelope; callers should
 * check `success` and surface `message` to the user when false.
 */
export async function newapiFetch<T = unknown>(
  path: string,
  init: RequestInitWithCookie = {},
): Promise<NewApiResponse<T>> {
  const { cookie, baseUrl, headers, ...rest } = init;
  const base = baseUrl ?? process.env.NEWAPI_INTERNAL_URL ?? 'http://localhost:3000';
  const res = await fetch(`${base}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
  });
  return res.json() as Promise<NewApiResponse<T>>;
}

// ----- public/system -----
export const getStatus = (init?: RequestInitWithCookie) =>
  newapiFetch<SystemStatus>('/api/status', init);

// ----- self/profile -----
export const getSelf = (init?: RequestInitWithCookie) =>
  newapiFetch<SelfUser>('/api/user/self', init);

export const getSelfModels = (init?: RequestInitWithCookie) =>
  newapiFetch<string[]>('/api/user/models', init);

export const getSelfGroups = (init?: RequestInitWithCookie) =>
  newapiFetch<Record<string, unknown>>('/api/user/self/groups', init);

// ----- auth -----
export const login = (body: { username: string; password: string }, init?: RequestInitWithCookie) =>
  newapiFetch<SelfUser>('/api/user/login', { ...init, method: 'POST', body: JSON.stringify(body) });

export const register = (
  body: {
    username: string;
    password: string;
    email?: string;
    verification_code?: string;
    aff_code?: string;
  },
  init?: RequestInitWithCookie,
) => newapiFetch<unknown>('/api/user/register', { ...init, method: 'POST', body: JSON.stringify(body) });

export const logout = (init?: RequestInitWithCookie) =>
  newapiFetch<unknown>('/api/user/logout', { ...init, method: 'GET' });

export const sendVerification = (
  email: string,
  type: 'register' | 'reset' | 'binding',
  init?: RequestInitWithCookie,
) => newapiFetch<unknown>(`/api/verification?email=${encodeURIComponent(email)}&type=${type}`, init);

export const oauthState = (init?: RequestInitWithCookie) =>
  newapiFetch<string>('/api/oauth/state', init);

// ----- tokens -----
export const listTokens = (
  params: { page?: number; size?: number } = {},
  init?: RequestInitWithCookie,
) => {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.size) q.set('size', String(params.size));
  return newapiFetch<Token[]>(`/api/token?${q.toString()}`, init);
};

export const createToken = (body: Partial<Token>, init?: RequestInitWithCookie) =>
  newapiFetch<Token>('/api/token', { ...init, method: 'POST', body: JSON.stringify(body) });

export const updateToken = (body: Partial<Token> & { id: number }, init?: RequestInitWithCookie) =>
  newapiFetch<Token>('/api/token', { ...init, method: 'PUT', body: JSON.stringify(body) });

export const deleteToken = (id: number, init?: RequestInitWithCookie) =>
  newapiFetch<unknown>(`/api/token/${id}`, { ...init, method: 'DELETE' });

export const getTokenKey = (id: number, init?: RequestInitWithCookie) =>
  newapiFetch<{ key: string }>(`/api/token/${id}/key`, { ...init, method: 'POST' });

// ----- topup / billing -----
export const getTopupInfo = (init?: RequestInitWithCookie) =>
  newapiFetch<TopupInfo>('/api/user/self/topup/info', init);

export const redeemCode = (key: string, init?: RequestInitWithCookie) =>
  newapiFetch<{ new_quota: number }>('/api/user/self/topup', {
    ...init,
    method: 'POST',
    body: JSON.stringify({ key }),
  });

export const getTopupHistory = (
  params: { page?: number; size?: number } = {},
  init?: RequestInitWithCookie,
) => {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.size) q.set('size', String(params.size));
  return newapiFetch<Pagination<unknown>>(`/api/user/self/topup/self?${q.toString()}`, init);
};

// ----- subscription -----
export const getSubscriptionPlans = (init?: RequestInitWithCookie) =>
  newapiFetch<Array<{ plan: SubscriptionPlan }>>('/api/subscription/plans', init);

export const getSelfSubscription = (init?: RequestInitWithCookie) =>
  newapiFetch<{
    billing_preference: string;
    subscriptions: unknown[];
    all_subscriptions: unknown[];
  }>('/api/subscription/self', init);

// ----- usage / logs -----
export const listLogsSelf = (
  params: Record<string, string | number | undefined> = {},
  init?: RequestInitWithCookie,
) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) q.set(k, String(v));
  }
  return newapiFetch<LogEntry[]>(`/api/log/self?${q.toString()}`, init);
};

export const getLogStat = (
  params: Record<string, string | number | undefined> = {},
  init?: RequestInitWithCookie,
) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) q.set(k, String(v));
  }
  return newapiFetch<LogStat>(`/api/log/self/stat?${q.toString()}`, init);
};

// ----- pricing / model catalog -----
export const getPricing = (init?: RequestInitWithCookie) =>
  newapiFetch<{
    pricing: ModelPricing[];
    vendors: Array<{ id: number; name: string }>;
    group_ratio: Record<string, number>;
    usable_group: Record<string, string>;
    pricing_version: string;
  }>('/api/pricing', init);

// ----- checkin -----
export const getCheckin = (month?: string, init?: RequestInitWithCookie) =>
  newapiFetch<CheckinStatus>(
    `/api/user/self/checkin${month ? `?month=${encodeURIComponent(month)}` : ''}`,
    init,
  );

export const performCheckin = (init?: RequestInitWithCookie) =>
  newapiFetch<{ quota_awarded: number; checkin_date: string }>('/api/user/self/checkin', {
    ...init,
    method: 'POST',
  });

// ----- chat (playground; SSE — must not be parsed as JSON; caller streams body) -----
export const PLAYGROUND_PATH = '/pg/chat/completions';
