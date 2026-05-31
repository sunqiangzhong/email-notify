/**
 * API 服务层
 * 封装所有与后端的通信
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// 获取存储的 token
const getToken = (): string | null => {
  return localStorage.getItem('token');
};

// 设置 token
const setToken = (token: string): void => {
  localStorage.setItem('token', token);
};

// 清除 token
const clearToken = (): void => {
  localStorage.removeItem('token');
};

// 通用请求方法
const request = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw {
      status: response.status,
      code: data.code,
      message: data.error || data.message || '请求失败',
    };
  }

  return data;
};

// ============ 认证接口 ============

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    name: string;
    email: string;
    avatarColor: string;
    role: string;
    status: string;
  };
}

export const authApi = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const result = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(result.token);
    return result;
  },

  register: async (username: string, password: string): Promise<LoginResponse> => {
    const result = await request<LoginResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(result.token);
    return result;
  },

  getMe: async () => {
    return request<{ id: string; username: string; name: string; email: string; avatarColor: string; role: string; status: string }>('/auth/me');
  },

  logout: () => {
    clearToken();
  },

  isAuthenticated: () => {
    return !!getToken();
  },

  changePassword: async (oldPassword: string, newPassword: string) => {
    return request<{ success: boolean; message: string }>('/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  },
};

// ============ 邮箱接口 ============

export interface MailAccountData {
  id: string;
  userId: string;
  name: string;
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
  useSSL: boolean;
  useProxy: boolean;
  proxyId: string | null;
  active: boolean;
  lastSync: string | null;
  createdAt: string;
  updatedAt: string;
}

export const emailApi = {
  getAll: async () => {
    return request<{ success: boolean; data: MailAccountData[] }>('/emails');
  },

  getById: async (id: string) => {
    return request<{ success: boolean; data: MailAccountData }>(`/emails/${id}`);
  },

  create: async (data: Partial<MailAccountData>) => {
    return request<{ success: boolean; data: MailAccountData }>('/emails', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<MailAccountData>) => {
    return request<{ success: boolean; data: MailAccountData }>(`/emails/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return request<{ success: boolean }>(`/emails/${id}`, {
      method: 'DELETE',
    });
  },

  testConnection: async (data: {
    email: string;
    password: string;
    imapHost: string;
    imapPort?: number;
    useSSL?: boolean;
    useProxy?: boolean;
    proxyHost?: string;
    proxyPort?: number;
    proxyType?: string;
  }) => {
    return request<{
      success: boolean;
      message: string;
      data?: {
        responseTime: number;
        openTime: number;
        serverHost: string;
        serverPort: number;
        serverGreeting: string;
        tlsStatus: boolean;
        accountEmail: string;
        provider: string;
        inbox: { total: number; unseen: number };
      };
    }>('/emails/test-connection', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // 测试已有邮箱连接（使用存储密码）
  testExistingConnection: async (id: string) => {
    return request<{
      success: boolean;
      message: string;
      data?: {
        responseTime: number;
        openTime: number;
        serverHost: string;
        serverPort: number;
        serverGreeting: string;
        tlsStatus: boolean;
        accountEmail: string;
        provider: string;
        inbox: { total: number; unseen: number };
      };
    }>(`/emails/${id}/test`, {
      method: 'POST',
    });
  },

  // 拉取最近邮件（分页）
  fetchRecent: async (id: string, page: number = 1, pageSize: number = 10) => {
    return request<{
      success: boolean;
      message: string;
      data: Array<{
        uid: number;
        id: string;
        fromName: string;
        fromAddress: string;
        to: string;
        subject: string;
        snippet: string;
        date: string;
        hasAttachments: boolean;
        attachmentsCount: number;
      }>;
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    }>(`/emails/${id}/messages?page=${page}&pageSize=${pageSize}`);
  },

  // 强制同步邮箱（重新扫描 IMAP 收件箱）
  sync: async (id: string) => {
    return request<{
      success: boolean;
      message: string;
      data: { total: number; newCount: number };
    }>(`/emails/${id}/sync`, { method: 'POST' });
  },

  // 获取单封邮件正文
  fetchBody: async (emailId: string, uid: number) => {
    return request<{
      success: boolean;
      data: { text: string; html: string };
    }>(`/emails/${emailId}/messages/${uid}/body`);
  },
};

// ============ 代理接口 ============

export interface ProxyData {
  id: string;
  userId: string;
  name: string;
  type: 'socks5' | 'socks4' | 'http' | 'https';
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  createdAt: string;
  updatedAt: string;
}

export const proxyApi = {
  getAll: async () => {
    return request<{ success: boolean; data: ProxyData[] }>('/proxies');
  },

  getById: async (id: string) => {
    return request<{ success: boolean; data: ProxyData }>(`/proxies/${id}`);
  },

  create: async (data: Partial<ProxyData>) => {
    return request<{ success: boolean; data: ProxyData }>('/proxies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<ProxyData>) => {
    return request<{ success: boolean; data: ProxyData }>(`/proxies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return request<{ success: boolean }>(`/proxies/${id}`, {
      method: 'DELETE',
    });
  },

  // 多场景连通性测试
  testConnectivity: async (data: { host: string; port: number; type: string }) => {
    return request<{
      success: boolean;
      data: {
        proxy: { host: string; port: number; type: string; reachable: boolean; latency: number | null };
        targets: Array<{ name: string; host: string; port: number; success: boolean; latency?: number; error?: string }>;
      };
    }>('/proxies/test-connectivity', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ============ 通知接口 ============

export interface NotificationData {
  id: string;
  userId: string;
  name: string;
  type: 'wecom_app' | 'wecom_webhook' | 'server_chan' | 'telegram' | 'dingtalk' | 'feishu' | 'custom_webhook';
  config: {
    // 企业微信应用
    corpId?: string;
    agentId?: string;
    appSecret?: string;
    proxyUrl?: string;
    token?: string;
    encodingAesKey?: string;
    adminUsers?: string;
    // 企业微信群机器人
    webhookUrl?: string;
    mentionedList?: string;
    // Server酱
    sendKey?: string;
    channel?: string;
    // Telegram
    botToken?: string;
    chatId?: string;
    apiProxy?: string;
    // 钉钉/飞书
    secret?: string;
    // 自定义 Webhook
    method?: string;
    headers?: string;
    bodyTemplate?: string;
  };
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FilterData {
  id: string;
  userId: string;
  name: string;
  emailId: string | null;
  notificationId: string | null;
  keywords: string[];
  matchType: 'any' | 'all';
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const notificationApi = {
  getAll: async () => {
    return request<{ success: boolean; data: NotificationData[] }>('/notifications');
  },

  getById: async (id: string) => {
    return request<{ success: boolean; data: NotificationData }>(`/notifications/${id}`);
  },

  create: async (data: Partial<NotificationData>) => {
    return request<{ success: boolean; data: NotificationData }>('/notifications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<NotificationData>) => {
    return request<{ success: boolean; data: NotificationData }>(`/notifications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string) => {
    return request<{ success: boolean }>(`/notifications/${id}`, {
      method: 'DELETE',
    });
  },

  testSend: async (id: string) => {
    return request<{ success: boolean; message: string }>(`/notifications/${id}/test`, {
      method: 'POST',
    });
  },

  // 获取通知类型配置（包含所有支持的通知渠道及其配置项）
  getTypes: async () => {
    return request<{ success: boolean; data: Record<string, { name: string; description: string; fields: Array<{ key: string; label: string; required: boolean; hint: string; default?: string }> }> }>('/notifications/types');
  },

  // 过滤规则
  getAllFilters: async () => {
    return request<{ success: boolean; data: FilterData[] }>('/notifications/filters');
  },

  createFilter: async (data: Partial<FilterData>) => {
    return request<{ success: boolean; data: FilterData }>('/notifications/filters', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateFilter: async (id: string, data: Partial<FilterData>) => {
    return request<{ success: boolean; data: FilterData }>(`/notifications/filters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteFilter: async (id: string) => {
    return request<{ success: boolean }>(`/notifications/filters/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============ 系统接口 ============

export interface SystemStatus {
  uptime: number;
  uptimeFormatted: string;
  memory: {
    total: string;
    free: string;
    used: string;
    usagePercent: string;
    heapUsed: string;
    heapTotal: string;
    rss: string;
  };
  cpu: {
    cores: number;
    model: string;
    loadAvg: number[];
  };
  platform: {
    os: string;
    arch: string;
    hostname: string;
    nodeVersion: string;
  };
  dataDir: {
    path: string;
    writable: boolean;
  };
}

export interface PingResult {
  name: string;
  host: string;
  port: number;
  success: boolean;
  avg?: string;
  min?: string;
  max?: string;
  error?: string;
}

export const systemApi = {
  getStatus: async () => {
    return request<{ success: boolean; data: SystemStatus }>('/system/status');
  },

  ping: async () => {
    return request<{ success: boolean; data: PingResult[] }>('/system/ping');
  },

  health: async () => {
    const response = await fetch(`${API_BASE}/health`);
    return response.json();
  },

  // 获取环境变量配置
  getEnv: async () => {
    return request<{ success: boolean; data: Record<string, string> }>('/system/env');
  },

  // 更新环境变量配置
  setEnv: async (env: Record<string, string>) => {
    return request<{ success: boolean; message: string }>('/system/env', {
      method: 'POST',
      body: JSON.stringify(env),
    });
  },

  // 获取单个配置项
  getSetting: async (key: string) => {
    return request<{ success: boolean; data: { key: string; value: string } }>(`/system/setting/${key}`);
  },

  // 更新单个配置项
  setSetting: async (key: string, value: string) => {
    return request<{ success: boolean; message: string; data: { key: string; value: string } }>(`/system/setting/${key}`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    });
  },
};

// ============ 连通性测试接口 ============

export interface ConnectivityTarget {
  name: string;
  host: string;
  port: number;
  category?: string;
}

export interface ConnectivityResult {
  name: string;
  host: string;
  port: number;
  category: string;
  success: boolean;
  latency: number | null;
  mode: string;
  status?: number;
  error?: string;
}

export interface ProxyReachResult {
  host: string;
  port: number;
  type: string;
  reachable: boolean;
  latency: number | null;
}

export interface ConnectivityPresets {
  email: ConnectivityTarget[];
  notification: ConnectivityTarget[];
  network: ConnectivityTarget[];
}

export const connectivityApi = {
  // 获取预设测试目标
  getPresets: async () => {
    return request<{ success: boolean; data: ConnectivityPresets }>('/system/connectivity/presets');
  },

  // 测试单个站点
  testOne: async (target: { host: string; port: number; name?: string; category?: string; mode?: string; timeout?: number; proxyConfig?: any }) => {
    return request<{ success: boolean; data: ConnectivityResult }>('/system/connectivity/test', {
      method: 'POST',
      body: JSON.stringify(target),
    });
  },

  // 批量测试多个站点
  testBatch: async (params: { targets: ConnectivityTarget[]; proxyConfig?: any; mode?: string; timeout?: number }) => {
    return request<{ success: boolean; data: ConnectivityResult[] }>('/system/connectivity/test', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  // 测试全部预设站点
  testAll: async (params?: { categories?: string[]; proxyConfig?: any; mode?: string; timeout?: number }) => {
    return request<{
      success: boolean;
      data: {
        proxy: ProxyReachResult | null;
        targets: ConnectivityResult[];
        summary: { total: number; success: number; failed: number; proxyUsed: boolean };
      };
    }>('/system/connectivity/test-all', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
  },

  // 仅测试代理可达性
  testProxy: async (params: { host: string; port: number; type?: string; timeout?: number }) => {
    return request<{ success: boolean; data: ProxyReachResult }>('/system/connectivity/test-proxy', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
};

// ============ API 令牌接口 ============

export const tokenApi = {
  // 获取当前令牌信息
  get: async () => {
    return request<{ success: boolean; data: { token: string | null; hasToken: boolean; message: string } }>('/token');
  },
};

// ============ 系统更新接口 ============

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
  cached: boolean;
}

export interface CurrentVersionInfo {
  version: string;
  isDocker: boolean;
  hasDockerAccess: boolean;
  canAutoUpdate: boolean;
}

export const updateApi = {
  // 获取当前版本信息
  getCurrent: async () => {
    return request<{ success: boolean; data: CurrentVersionInfo }>('/update/current');
  },

  // 检查是否有新版本
  check: async (force = false) => {
    return request<{ success: boolean; data: UpdateCheckResult }>(`/update/check?force=${force}`);
  },

  // 执行自动更新
  perform: async () => {
    return request<{
      success: boolean;
      message: string;
      data: { log: Array<{ time: string; message: string }> };
    }>('/update/perform', {
      method: 'POST',
    });
  },
};
