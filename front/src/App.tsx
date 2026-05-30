import { useState, useEffect, useCallback, useRef } from 'react'
import {
  LayoutDashboard,
  Mail,
  Globe,
  MessageSquareCode,
  Menu,
  X,
  Clock,
  User,
  Layers,
  Users,
  ShieldAlert,
  LogOut,
  Loader2
} from 'lucide-react'
import { MailAccount, EmailLog, ProxyConfig, WeChatConfig, UserProfile } from './types'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { EmailSSEProvider, useEmailSSE, SSEEmailEvent } from './contexts/EmailSSEContext'
import LoginPage from './components/LoginPage'
import DashboardView from './components/DashboardView'
import MailAccountsView from './components/MailAccountsView'
import ProxySettingsView from './components/ProxySettingsView'
import WeChatNotificationsView from './components/WeChatNotificationsView'
import MultiUserManagementView from './components/MultiUserManagementView';
import LogViewer from './components/LogViewer';
import ProfileSettingsView from './components/ProfileSettingsView';
import { ToastContainer, ToastItem } from './components/Toast';
import { emailApi, proxyApi, notificationApi, MailAccountData, ProxyData, NotificationData } from './services/api'

// 主应用内容（需要认证）
function AppContent() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()

  // 数据状态
  const [accounts, setAccounts] = useState<MailAccount[]>([])
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig>({
    enabled: false,
    type: 'SOCKS5',
    host: '',
    port: 1080,
    username: '',
    password: '',
    latency: null,
    isTesting: false
  })
  const [wechatConfig, setWechatConfig] = useState<WeChatConfig>({
    provider: 'server_chan',
    token: '',
    secret: '',
    webhookUrl: '',
    rules: {
      enableFilter: false,
      keywords: '',
      dndEnabled: false,
      dndStart: '22:00',
      dndEnd: '08:00'
    }
  })

  // UI 状态
  const [activeTab, setActiveTab] = useState<'dashboard' | 'accounts' | 'proxy' | 'wechat' | 'users' | 'profile'>('dashboard')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState<string>('')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  // Toast 工具
  const triggerToast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = 'toast-' + Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // 时钟
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const date = String(now.getDate()).padStart(2, '0')
      const hours = String(now.getHours()).padStart(2, '0')
      const minutes = String(now.getMinutes()).padStart(2, '0')
      const seconds = String(now.getSeconds()).padStart(2, '0')
      setCurrentTime(`${year}-${month}-${date} ${hours}:${minutes}:${seconds}`)
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  // 辅助函数：根据 IMAP Host 判断邮箱类型
  const getMailProvider = (host: string): 'qq' | 'gmail' | 'outlook' | 'custom' => {
    if (host.includes('qq')) return 'qq'
    if (host.includes('gmail')) return 'gmail'
    if (host.includes('outlook') || host.includes('hotmail')) return 'outlook'
    return 'custom'
  }

  // 从后端加载数据
  useEffect(() => {
    if (!isAuthenticated) return

    const loadData = async () => {
      setDataLoading(true)
      try {
        // 并行加载所有数据
        const [emailsRes, proxiesRes, notificationsRes] = await Promise.allSettled([
          emailApi.getAll(),
          proxyApi.getAll(),
          notificationApi.getAll()
        ])

        // 处理邮箱数据
        if (emailsRes.status === 'fulfilled' && emailsRes.value.success) {
          const mailAccounts: MailAccount[] = emailsRes.value.data.map((e: MailAccountData) => ({
            id: e.id,
            name: e.name,
            email: e.email,
            type: getMailProvider(e.imapHost),
            status: e.active ? 'online' : 'error',
            imapHost: e.imapHost,
            imapPort: e.imapPort,
            ssl: e.useSSL,
            lastChecked: e.lastSync ? new Date(e.lastSync).toLocaleString('zh-CN') : undefined
          }))
          setAccounts(mailAccounts)
        }

        // 处理代理数据
        if (proxiesRes.status === 'fulfilled' && proxiesRes.value.success && proxiesRes.value.data.length > 0) {
          const proxy = proxiesRes.value.data[0] // 取第一个代理
          setProxyConfig({
            id: proxy.id,
            enabled: true,
            type: proxy.type.toUpperCase() as any,
            host: proxy.host,
            port: proxy.port,
            username: proxy.username || '',
            password: proxy.password || '',
            latency: null,
            isTesting: false
          })
        }

        // 处理通知数据
        if (
          notificationsRes.status === 'fulfilled' &&
          notificationsRes.value.success &&
          notificationsRes.value.data.length > 0
        ) {
          const notif = notificationsRes.value.data[0] // 取第一个通知配置
          setWechatConfig({
            provider: mapNotificationTypeToProvider(notif.type),
            token: '',
            secret: notif.secret || '',
            webhookUrl: notif.webhookUrl,
            rules: {
              enableFilter: false,
              keywords: '',
              dndEnabled: false,
              dndStart: '22:00',
              dndEnd: '08:00'
            }
          })
        }
      } catch (error) {
        console.error('加载数据失败:', error)
        triggerToast('加载数据失败，请刷新重试', 'error')
      } finally {
        setDataLoading(false)
      }
    }

    loadData()
  }, [isAuthenticated])

  // 实时新邮件通知（通过 SSE Context）
  const { recentEvents, isConnected } = useEmailSSE()
  const processedEventIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (recentEvents.length === 0) return
    const latest = recentEvents[0]
    // Only process each event once (deduplicate by logId)
    if (processedEventIds.current.has(latest.logId)) return
    processedEventIds.current.add(latest.logId)

    // Toast notification
    triggerToast(`${latest.senderName || latest.senderEmail}: ${latest.subject}`, 'info')

    // Silently refresh account list to update lastSync times
    emailApi.getAll().then(res => {
      if (res.success) {
        const mailAccounts: MailAccount[] = res.data.map((e: MailAccountData) => ({
          id: e.id,
          name: e.name,
          email: e.email,
          type: getMailProvider(e.imapHost),
          status: e.active ? 'online' : 'error',
          imapHost: e.imapHost,
          imapPort: e.imapPort,
          ssl: e.useSSL,
          lastChecked: e.lastSync ? new Date(e.lastSync).toLocaleString('zh-CN') : undefined
        }))
        setAccounts(mailAccounts)
      }
    }).catch(() => {})
  }, [recentEvents, triggerToast])

  // 辅助函数：通知类型映射
  const mapNotificationTypeToProvider = (type: string): WeChatConfig['provider'] => {
    switch (type) {
      case 'serverchan':
        return 'server_chan'
      case 'wecom':
        return 'wecom_app'
      case 'custom':
        return 'custom_webhook'
      default:
        return 'server_chan'
    }
  }

  // 用户资料（用于侧边栏显示）
  const currentUser: UserProfile = {
    id: user?.id || '',
    name: user?.username || '用户',
    email: `${user?.username}@mailwenotify.local`,
    avatarColor: 'bg-blue-600',
    role: 'user',
    disabled: false,
    status: 'active'
  }

  // 模拟新邮件（现在只是前端展示用）
  const simulateIncomingEmail = () => {
    triggerToast('后端正在实时监听邮箱，新邮件将自动推送通知', 'info')
  }

  // 登录中加载界面
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[#8B949E]">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>正在验证身份...</span>
        </div>
      </div>
    )
  }

  // 未登录显示登录页
  if (!isAuthenticated) {
    return <LoginPage />
  }

  // 数据加载中
  if (dataLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-[#58A6FF]" />
          <span className="text-[#8B949E]">正在加载数据...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#0A0A0B] text-[#C9D1D9] flex flex-col md:flex-row antialiased font-sans overflow-hidden">
      {/* Toast 通知 */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* 移动端头部 */}
      <div className="md:hidden flex items-center justify-between px-5 py-4 bg-[#0D1117] border-b border-[#30363D] z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg">
            <Mail className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[#E6EDF3] tracking-tight text-sm font-display">MailWeNotify</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-1.5 rounded-lg border border-[#30363D] text-[#C9D1D9] hover:text-white hover:bg-[#1F242C] transition-all cursor-pointer"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* 侧边栏 */}
      <aside
        className={`fixed inset-y-0 left-0 w-[220px] bg-[#0D1117] border-r border-[#30363D] p-4 flex flex-col justify-between z-20 transform md:transform-none md:translate-x-0 transition-transform duration-300 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-6">
          {/* Logo */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 px-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md">
                <Layers className="w-4.5 h-4.5" />
              </div>
              <div>
                <span className="font-bold text-[#E6EDF3] tracking-tight text-sm font-display block">MailWeNotify</span>
                <span className="text-[10px] text-[#58A6FF] font-medium tracking-wide block font-mono uppercase">
                  Aggregator Hub
                </span>
              </div>
            </div>

            {/* 时钟 */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0A0A0B] border border-[#30363D] text-[#C9D1D9]">
              <Clock className="w-3.5 h-3.5 text-[#58A6FF] flex-shrink-0" />
              <span className="font-mono text-[10px] truncate tracking-wide text-[#E6EDF3]">{currentTime}</span>
            </div>
          </div>

          {/* 导航菜单 */}
          <nav className="space-y-1">
            {[
              { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
              { id: 'accounts', label: '邮箱账户', icon: Mail },
              { id: 'proxy', label: '代理设置', icon: Globe },
              { id: 'wechat', label: '通知', icon: MessageSquareCode }
            ].map(item => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any)
                    setIsMobileMenuOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#1F242C] text-[#58A6FF] font-semibold border-l-2 border-[#58A6FF]'
                      : 'text-[#C9D1D9] hover:text-[#E6EDF3] hover:bg-[#1F242C]/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#58A6FF]' : 'text-[#C9D1D9]'}`} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* 底部用户信息 */}
        <div className="space-y-3 pt-4 border-t border-[#30363D] relative">
          {/* 用户菜单弹出 */}
          {isUserMenuOpen && (
            <div className="absolute bottom-[65px] left-0 right-0 bg-[#161B22] border border-[#30363D] rounded-md p-1.5 shadow-2xl flex flex-col gap-1 z-30 font-sans text-xs">
              <div className="px-2 py-1 text-[10px] text-slate-500 font-medium tracking-wider border-b border-[#30363D]/60 mb-1 select-none">
                当前用户: {currentUser.name}
              </div>

              <button
                onClick={() => {
                  setIsUserMenuOpen(false)
                  setActiveTab('profile')
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-[#1F242C] text-[#C9D1D9] hover:text-white transition-all text-left cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-blue-400" />
                <span>个人设置 / Profile</span>
              </button>

              <button
                onClick={() => {
                  setIsUserMenuOpen(false)
                  logout()
                  triggerToast('已退出登录', 'warning')
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-[#1F242C] text-[#C9D1D9] hover:text-white transition-all text-left border-t border-[#30363D]/40 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span>退出登录 / Logout</span>
              </button>
            </div>
          )}

          {/* 用户卡片 */}
          <div
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2.5 p-2 bg-[#161B22] border border-[#30363D] hover:border-[#58A6FF]/65 rounded-lg cursor-pointer hover:bg-[#1F242C]/50 transition-all select-none group"
            title="查看个人设置 / 登出系统"
          >
            <div
              className={`w-8 h-8 rounded-md ${currentUser.avatarColor} border border-black/30 flex items-center justify-center font-bold text-white shadow-sm shrink-0 transition-transform group-hover:scale-105`}
            >
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[#E6EDF3] font-semibold block truncate font-sans text-[11px] group-hover:text-[#58A6FF] transition-colors">
                {currentUser.name}
              </span>
              <span className="text-[10px] text-[#8B949E] font-mono block truncate">
                ID: {currentUser.id.substring(0, 8)}...
              </span>
            </div>
          </div>

          {/* 版本信息 */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 px-1 font-mono">
            <div className="flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span>Daemon Live</span>
            </div>
            <span>v2.4.0 • Enterprise</span>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 md:pl-[220px] flex flex-col">
        {/* 顶部状态栏 */}
        <header className="sticky top-0 bg-[#0D1117]/85 backdrop-blur-md border-b border-[#30363D] px-4 md:px-6 py-3 flex items-center justify-between z-10 select-none">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-slow"></div>
            <span className="text-[11px] font-mono text-[#8B949E] hidden lg:inline">
              GATEWAY_THREAD: DAEMON_RETRIEVAL_STREAM_ACTIVE
            </span>
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[9px] px-2 py-0.5 rounded font-sans font-medium">
              ✉️ 邮箱实时监听中 • 共 {accounts.length} 个账户
            </span>
          </div>

          <div className="flex items-center gap-3">
            <LogViewer />
            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
              {isConnected ? '后端已连接 (SSE)' : '正在连接...'}
            </span>
          </div>
        </header>

        {/* 内容区域 */}
        <div className="flex-1 min-h-0 flex flex-col max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              triggerToast={triggerToast}
            />
          )}

          {activeTab === 'accounts' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-5">
              <MailAccountsView accounts={accounts} setAccounts={setAccounts} triggerToast={triggerToast} />
            </div>
          )}

          {activeTab === 'proxy' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-5">
              <ProxySettingsView proxyConfig={proxyConfig} setProxyConfig={setProxyConfig} triggerToast={triggerToast} />
            </div>
          )}

          {activeTab === 'wechat' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-5">
              <WeChatNotificationsView
                triggerToast={triggerToast}
              />
            </div>
          )}

          {activeTab === 'users' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-5">
              <MultiUserManagementView
                users={[currentUser]}
                toggleUserStatus={() => {}}
                userStats={{
                  [currentUser.id]: {
                    accountsCount: accounts.length,
                    logsCount: logs.length,
                    provider: 'wecom_app'
                  }
                }}
                triggerToast={triggerToast}
              />
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-5">
              <ProfileSettingsView triggerToast={triggerToast} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// 包裹 SSE Provider，根据认证状态控制连接
function AppWithSSE() {
  const { isAuthenticated, isLoading } = useAuth()
  return (
    <EmailSSEProvider enabled={isAuthenticated && !isLoading}>
      <AppContent />
    </EmailSSEProvider>
  )
}

// 根组件，包裹 AuthProvider
export default function App() {
  return (
    <AuthProvider>
      <AppWithSSE />
    </AuthProvider>
  )
}
