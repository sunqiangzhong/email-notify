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
      message: data.message,
    };
  }

  return data;
};

// ============ 认证接口 ============

export interface LoginResponse {
  success: boolean;
  code: string;
  message: string;
  data: {
    token: string;
    user: {
      id: string;
      username: string;
      createdAt: string;
    };
  };
}

export const authApi = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const result = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(result.data.token);
    return result;
  },

  register: async (username: string, password: string): Promise<LoginResponse> => {
    const result = await request<LoginResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(result.data.token);
    return result;
  },

  getMe: async () => {
    return request<{ success: boolean; data: { id: string; username: string; createdAt: string } }>('/auth/me');
  },

  logout: () => {
    clearToken();
  },

  isAuthenticated: () => {
    return !!getToken();
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
      data?: { server: string; responseTime: number };
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
      data?: { server: string; responseTime: number };
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
};
