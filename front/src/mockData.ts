import { MailAccount, EmailLog, ProxyConfig, WeChatConfig, UserProfile } from './types';

export const INITIAL_USERS: UserProfile[] = [
  {
    id: 'user-a',
    name: '张三',
    email: 'zhangsan@example.com',
    avatarColor: 'bg-emerald-600',
    role: 'user',
    disabled: false,
    status: 'active'
  },
  {
    id: 'user-b',
    name: '李四',
    email: 'lisi@example.com',
    avatarColor: 'bg-blue-600',
    role: 'user',
    disabled: false,
    status: 'active'
  },
  {
    id: 'user-admin',
    name: '王五',
    email: 'wangwu@example.com',
    avatarColor: 'bg-rose-600',
    role: 'super_admin',
    disabled: false,
    status: 'active'
  }
];

export const INITIAL_USER_DATA: Record<string, {
  accounts: MailAccount[];
  logs: EmailLog[];
  proxyConfig: ProxyConfig;
  wechatConfig: WeChatConfig;
}> = {
  'user-a': {
    accounts: [
      {
        id: 'mail-a1',
        email: '1029384756@qq.com',
        type: 'qq',
        status: 'online',
        imapHost: 'imap.qq.com',
        imapPort: 993,
        ssl: true,
        lastChecked: '2026-05-26 09:42:55',
      },
      {
        id: 'mail-a2',
        email: 'developer-hr@qq.com',
        type: 'qq',
        status: 'online',
        imapHost: 'imap.qq.com',
        imapPort: 993,
        ssl: true,
        lastChecked: '2026-05-26 09:30:11',
      }
    ],
    logs: [
      {
        id: 'log-a1',
        subject: '🚨 Server alert: High memory utilization on Node 04',
        senderName: 'AWS CloudWatch Alerts',
        senderEmail: 'no-reply@aws.amazon.com',
        toEmail: 'developer-hr@qq.com',
        receivedAt: '2026-05-26 09:55:22',
        dateRaw: '2026-05-26T01:55:22.000Z',
        forwardStatus: 'forwarded',
        forwardTarget: 'Server酱 App',
        snippet: 'Metric MemoryUtilization has exceeded threshold 85% with value 89.2% in the last 5 minutes...',
      },
      {
        id: 'log-a2',
        subject: '💸 GitHub Sponsor Receipt: You supported Webpack Core Maintainers',
        senderName: 'GitHub Billing',
        senderEmail: 'billing@github.com',
        toEmail: '1029384756@qq.com',
        receivedAt: '2026-05-26 09:42:15',
        dateRaw: '2026-05-26T01:42:15.000Z',
        forwardStatus: 'forwarded',
        forwardTarget: 'Server酱 App',
        snippet: 'Thank you for sponsoring @webpack-contrib. You have been billed USD 15.00 for the recurring monthly plan...',
      },
      {
        id: 'log-a3',
        subject: '🎉 [Ad-exempt] Off-topic discussion: Next weekend barbecue group setup',
        senderName: 'Co-worker John',
        senderEmail: 'john@creative-studio.org',
        toEmail: '1029384756@qq.com',
        receivedAt: '2026-05-26 08:30:15',
        dateRaw: '2026-05-26T00:30:15.000Z',
        forwardStatus: 'failed',
        forwardTarget: 'Server酱 App',
        errorDetails: 'Ignored: Filtered by Keyword Filter Rules ["Ad-exempt", "barbecue"]',
        snippet: 'Hey everyone, let us gather at the coastal park next Saturday for bbq! Bringing meat and music...',
      }
    ],
    proxyConfig: {
      enabled: true,
      type: 'SOCKS5',
      host: 'socks5.zhangsan-proxy.net',
      port: 1080,
      username: 'zs_socks',
      password: 'password123',
      latency: 45,
      isTesting: false
    },
    wechatConfig: {
      provider: 'server_chan',
      token: 'SCT_A_78234T',
      secret: '',
      webhookUrl: 'https://sctapi.ftqq.com/SCT89237t7r9b.send',
      rules: {
        enableFilter: true,
        keywords: 'alert, MemoryUtilization, quota, verification, verification code',
        dndEnabled: false,
        dndStart: '22:00',
        dndEnd: '08:00',
      }
    }
  },
  'user-b': {
    accounts: [
      {
        id: 'mail-b1',
        email: 'bill-notify@gmail.com',
        type: 'gmail',
        status: 'online',
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        ssl: true,
        lastChecked: '2026-05-26 09:44:03',
      }
    ],
    logs: [
      {
        id: 'log-b1',
        subject: '🔑 Your Google Account One-Time Verification Code: 593842',
        senderName: 'Google Accounts Team',
        senderEmail: 'no-reply@accounts.google.com',
        toEmail: 'bill-notify@gmail.com',
        receivedAt: '2026-05-26 09:51:04',
        dateRaw: '2026-05-26T01:51:04.000Z',
        forwardStatus: 'forwarded',
        forwardTarget: 'Enterprise WeChat App',
        snippet: 'Use code 593842 to finalize your sign-in. This code is active for 10 minutes from now...',
      },
      {
        id: 'log-b2',
        subject: '⚠️ Error: Auto-sync failed with status 502 Bad Gateway',
        senderName: 'SaaS Webhook Syncer',
        senderEmail: 'errors@saas-sync.io',
        toEmail: 'bill-notify@gmail.com',
        receivedAt: '2026-05-26 09:20:01',
        dateRaw: '2026-05-26T01:20:01.000Z',
        forwardStatus: 'failed',
        forwardTarget: 'Enterprise WeChat App',
        errorDetails: 'API response timeout. Destination Webhook returned 502 cloud-ingress error.',
        snippet: 'Synchronization worker batch_4892 failed after retrying 3 times with HTTP code 502...',
      }
    ],
    proxyConfig: {
      enabled: true,
      type: 'HTTP',
      host: 'http.lisi-gateway.org',
      port: 8080,
      username: 'ls_http',
      password: 'password456',
      latency: 110,
      isTesting: false
    },
    wechatConfig: {
      provider: 'wecom_app',
      token: 'wx8ab3d92fe1e39a8c_token_xyz999',
      secret: 's_Kj8L3nm7x9AqYh_ZpW3_v9dK2p1x9mS',
      webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc-123-xyz',
      rules: {
        enableFilter: true,
        keywords: 'alert, verification code, Google, sync',
        dndEnabled: true,
        dndStart: '23:00',
        dndEnd: '07:30',
      }
    }
  },
  'user-admin': {
    accounts: [
      {
        id: 'mail-admin1',
        email: 'hr-notice@company.com',
        type: 'custom',
        status: 'online',
        imapHost: 'imap.company.com',
        imapPort: 993,
        ssl: true,
        lastChecked: '2026-05-26 09:45:12',
      },
      {
        id: 'mail-admin2',
        email: 'marketing-dev@outlook.com',
        type: 'outlook',
        status: 'error',
        imapHost: 'imap-mail.outlook.com',
        imapPort: 993,
        ssl: true,
        lastChecked: '2026-05-25 18:30:11',
      },
      {
        id: 'mail-admin3',
        email: 'system-relay@gmail.com',
        type: 'gmail',
        status: 'online',
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        ssl: true,
        lastChecked: '2026-05-26 09:32:00',
      }
    ],
    logs: [
      {
        id: 'log-admin1',
        subject: '🚨 Security Alert: Unauthorized DB Connection attempt blocked',
        senderName: 'SecOps Auditor',
        senderEmail: 'cybersec@company.com',
        toEmail: 'hr-notice@company.com',
        receivedAt: '2026-05-26 09:49:00',
        dateRaw: '2026-05-26T01:49:00.000Z',
        forwardStatus: 'forwarded',
        forwardTarget: 'PushDeer App',
        snippet: 'IP 198.51.100.44 attempted to connect to postgresql-cluster-01 without client certificate...',
      },
      {
        id: 'log-admin2',
        subject: '💼 Weekly Recruiting Pipeline Pipeline Summary & Interview Schedule',
        senderName: 'HR Recruiter Team',
        senderEmail: 'talent@company.com',
        toEmail: 'hr-notice@company.com',
        receivedAt: '2026-05-26 09:05:40',
        dateRaw: '2026-05-26T01:05:40.000Z',
        forwardStatus: 'forwarded',
        forwardTarget: 'PushDeer App',
        snippet: 'Hi Admin, here is the upcoming schedule for 4 candidates interviewing this week for the Senior Designer position...',
      }
    ],
    proxyConfig: {
      enabled: false,
      type: 'SOCKS5',
      host: '127.0.0.1',
      port: 1080,
      username: 'sys_root',
      password: '',
      latency: null,
      isTesting: false
    },
    wechatConfig: {
      provider: 'custom_webhook',
      token: 'PDKEY89372X',
      secret: '',
      webhookUrl: 'https://api2.pushdeer.com/message/push',
      rules: {
        enableFilter: false,
        keywords: '',
        dndEnabled: false,
        dndStart: '22:00',
        dndEnd: '08:00',
      }
    }
  }
};

// Legacy exports for backward compatibility default fallbacks
export const INITIAL_MAIL_ACCOUNTS = INITIAL_USER_DATA['user-a'].accounts;
export const INITIAL_EMAIL_LOGS = INITIAL_USER_DATA['user-a'].logs;
export const DEFAULT_PROXY_CONFIG = INITIAL_USER_DATA['user-a'].proxyConfig;
export const DEFAULT_WECHAT_CONFIG = INITIAL_USER_DATA['user-a'].wechatConfig;
