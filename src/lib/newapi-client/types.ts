// Shared response envelope used by every new-api endpoint.
// Confirmed in new-api/common/gin.go.
export type NewApiResponse<T = unknown> = {
  success: boolean;
  message: string;
  data?: T;
};

export type Pagination<T> = {
  items: T[];
  page: number;
  size: number;
  total: number;
};

export type SystemStatus = {
  version: string;
  start_time: number;
  email_verification: boolean;
  github_oauth: boolean;
  github_client_id?: string;
  discord_oauth: boolean;
  discord_client_id?: string;
  linuxdo_oauth: boolean;
  linuxdo_client_id?: string;
  oidc_enabled: boolean;
  oidc_client_id?: string;
  oidc_authorization_endpoint?: string;
  passkey_login: boolean;
  telegram_oauth: boolean;
  telegram_bot_name?: string;
  wechat_login: boolean;
  wechat_qrcode?: string;
  theme: string;
  system_name: string;
  logo: string;
  footer_html: string;
  server_address: string;
  turnstile_check: boolean;
  turnstile_site_key?: string;
  top_up_link?: string;
  docs_link?: string;
  quota_per_unit: number;
  display_in_currency: boolean;
  quota_display_type?: string;
  custom_currency_symbol?: string;
  custom_currency_exchange_rate?: number;
  enable_drawing: boolean;
  enable_task: boolean;
  enable_data_export: boolean;
  checkin_enabled: boolean;
  api_info_enabled: boolean;
  announcements_enabled: boolean;
  faq_enabled: boolean;
  custom_oauth_providers?: Array<{
    id: string;
    name: string;
    icon?: string;
    authorization_endpoint?: string;
  }>;
};

export type SelfUser = {
  id: number;
  username: string;
  display_name: string;
  role: number;
  status: number;
  email: string;
  group: string;
  quota: number;
  used_quota: number;
  request_count: number;
  aff_code: string;
  aff_count: number;
  aff_quota: number;
  aff_history_quota: number;
  inviter_id: number;
  github_id?: string;
  discord_id?: string;
  oidc_id?: string;
  wechat_id?: string;
  telegram_id?: string;
  linux_do_id?: string;
  setting?: string;
  stripe_customer?: string;
  sidebar_modules?: string;
};

export type Token = {
  id: number;
  user_id: number;
  key: string;
  name: string;
  status: number;
  created_time: number;
  accessed_time: number;
  expired_time: number;
  remain_quota: number;
  unlimited_quota: boolean;
  model_limits_enabled: boolean;
  model_limits?: Record<string, number>;
  allow_ips?: string;
  group: string;
};

export type LogEntry = {
  id: number;
  user_id: number;
  created_at: number;
  type: number; // 0=unknown 1=topup 2=consume 3=manage 4=system 5=error 6=refund
  content: string;
  username: string;
  token_name: string;
  model_name: string;
  quota: number;
  prompt_tokens: number;
  completion_tokens: number;
  use_time: number;
  is_stream: boolean;
  channel: number;
  token_id: number;
  group: string;
  ip?: string;
  request_id?: string;
  other?: string;
};

export type LogStat = {
  quota: number;
  rpm: number;
  tpm: number;
};

export type TopupInfo = {
  enable_online_topup: boolean;
  enable_stripe_topup: boolean;
  enable_creem_topup: boolean;
  enable_waffo_topup: boolean;
  enable_waffo_pancake_topup: boolean;
  pay_methods: Array<{ type: string; name: string; min_topup: number }>;
  min_topup: number;
  stripe_min_topup: number;
  amount_options?: number[];
  discount?: { amount: number };
};

export type SubscriptionPlan = {
  id: number;
  name: string;
  description: string;
  price: number;
  currency: string;
  recurring_interval: string;
  quota_per_period: number;
  enabled: boolean;
  sort_order: number;
};

export type ModelPricing = {
  model: string;
  vendor: string;
  pricing?: { input: number; output: number };
  enable_group?: string[];
};

export type CheckinStatus = {
  enabled: boolean;
  min_quota: number;
  max_quota: number;
  stats: {
    total_quota: number;
    total_checkins: number;
    checkin_count: number;
    checked_in_today: boolean;
    records: Array<{ checkin_date: string; quota_awarded: number }>;
  };
};
