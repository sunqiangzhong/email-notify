export type MailProvider = 'qq' | 'gmail' | 'outlook' | 'custom';

export interface MailAccount {
  id: string;
  name?: string;
  email: string;
  type: MailProvider;
  status: 'online' | 'error' | 'connecting';
  imapHost: string;
  imapPort: number;
  ssl: boolean;
  lastChecked?: string;
}

export type ForwardStatus = 'forwarded' | 'sending' | 'failed' | 'no_channel';

export interface EmailLog {
  id: string;
  uid?: number;
  subject: string;
  senderName: string;
  senderEmail: string;
  toEmail: string;
  toAccountId?: string;
  toAccountHost?: string;
  receivedAt: string;      // 显示用（本地化格式）
  dateRaw: string;          // 排序用（ISO 字符串，避免二次解析）
  forwardStatus: ForwardStatus;
  forwardTarget?: string;
  errorDetails?: string;
  snippet?: string;
}

export type ProxyType = 'HTTP' | 'SOCKS5';

export interface ProxyConfig {
  id?: string; // 后端代理 ID（保存后存在）
  enabled: boolean;
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  latency?: number | null; // null: untested, -1: timeout, >0: latency in ms
  isTesting?: boolean;
}

export type WeChatProvider = 'wecom_app' | 'wecom_bot' | 'server_chan' | 'custom_webhook';

export interface FilterRules {
  enableFilter: boolean;
  keywords: string; // comma-separated keywords or simple words
  dndEnabled: boolean;
  dndStart: string; // e.g., "22:00"
  dndEnd: string; // e.g., "08:00"
}

export interface WeChatConfig {
  provider: WeChatProvider;
  token: string;
  secret: string;
  webhookUrl: string;
  rules: FilterRules;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  role: 'user' | 'super_admin';
  disabled: boolean; // Flag to simulate disabling their email collection service
  status: 'active' | 'suspended';
}

