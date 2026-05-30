import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Server, Mail, Send, Radio, Search, Filter, CheckCircle2, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Layers, RefreshCw, Inbox
} from 'lucide-react'
import { EmailLog, ForwardStatus } from '../types'
import { motion, AnimatePresence } from 'motion/react'
import { emailApi, notificationApi, MailAccountData } from '../services/api'
import { useEmailSSE, SSEEmailEvent } from '../contexts/EmailSSEContext'

interface DashboardViewProps {
  triggerToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void
}

// 邮箱类型配置
const providerConfig: Record<string, { name: string; color: string; bg: string }> = {
  qq: { name: 'QQ', color: 'text-[#009bfa]', bg: 'bg-[#009bfa]/10 border-[#009bfa]/30' },
  gmail: { name: 'Gmail', color: 'text-[#ea4335]', bg: 'bg-[#ea4335]/10 border-[#ea4335]/30' },
  outlook: { name: 'Outlook', color: 'text-[#0078d4]', bg: 'bg-[#0078d4]/10 border-[#0078d4]/30' },
  custom: { name: 'IMAP', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/30' },
}

const getProvider = (host: string): string => {
  if (!host) return 'custom'
  if (host.includes('qq')) return 'qq'
  if (host.includes('gmail')) return 'gmail'
  if (host.includes('outlook') || host.includes('hotmail')) return 'outlook'
  return 'custom'
}

export default function DashboardView({ triggerToast }: DashboardViewProps) {
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [accounts, setAccounts] = useState<MailAccountData[]>([])
  const [hasNotification, setHasNotification] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [mailboxFilter, setMailboxFilter] = useState<string>('all')
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  const [expandedBody, setExpandedBody] = useState<string>('')
  const [loadingBody, setLoadingBody] = useState(false)
  const [newEmailCount, setNewEmailCount] = useState(0)

  // SSE 实时订阅
  const { recentEvents, isConnected, clearRecentEvents } = useEmailSSE()
  const processedSSEIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (recentEvents.length === 0) return

    const newLogs: EmailLog[] = []
    for (const evt of recentEvents) {
      if (processedSSEIds.current.has(evt.logId)) continue
      processedSSEIds.current.add(evt.logId)

      // Look up account host from the accounts list
      const acc = accounts.find(a => a.id === evt.accountId)

      newLogs.push({
        id: evt.logId,
        uid: undefined,
        subject: evt.subject,
        senderName: evt.senderName || '未知',
        senderEmail: evt.senderEmail || '',
        toEmail: evt.toEmail || evt.accountEmail,
        toAccountId: evt.accountId,
        toAccountHost: acc?.imapHost,
        receivedAt: new Date(evt.receivedAt).toLocaleString('zh-CN'),
        dateRaw: evt.receivedAt,
        forwardStatus: 'sending' as ForwardStatus,
        snippet: evt.snippet || '',
      })
    }

    if (newLogs.length > 0) {
      setLogs(prev => {
        // Deduplicate by id against existing logs
        const existingIds = new Set(prev.map(l => l.id))
        const unique = newLogs.filter(l => !existingIds.has(l.id))
        if (unique.length === 0) return prev
        return [...unique, ...prev]
      })
      setNewEmailCount(prev => prev + newLogs.length)
    }

    // Consume events so they aren't re-processed
    clearRecentEvents()
  }, [recentEvents, accounts, clearRecentEvents])

  const fetchAllLogs = useCallback(async () => {
    setLoading(true)
    try {
      // 并行获取邮箱列表和通知配置
      const [emailsRes, notifRes] = await Promise.allSettled([
        emailApi.getAll(),
        notificationApi.getAll(),
      ])

      // 检查是否有活跃的通知配置
      if (notifRes.status === 'fulfilled' && notifRes.value.success) {
        const activeNotifs = notifRes.value.data.filter(n => n.active)
        setHasNotification(activeNotifs.length > 0)
      }

      if (emailsRes.status !== 'fulfilled' || !emailsRes.value.success) {
        setLoading(false)
        return
      }

      const accs = emailsRes.value.data
      setAccounts(accs)

      // 并行拉取每个邮箱的最近 5 封邮件
      const allLogs: EmailLog[] = []
      const results = await Promise.allSettled(
        accs.map(acc => emailApi.fetchRecent(acc.id, 1, 5))
      )

      const hasActiveNotif = (notifRes.status === 'fulfilled' && notifRes.value.success)
        ? notifRes.value.data.filter(n => n.active).length > 0
        : false

      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (result.status === 'fulfilled' && result.value.success) {
          const acc = accs[i]
          for (const mail of result.value.data) {
            allLogs.push({
              id: mail.id,
              uid: mail.uid,
              subject: mail.subject,
              senderName: mail.fromName || '未知',
              senderEmail: mail.fromAddress || '',
              toEmail: acc.email,
              toAccountId: acc.id,
              toAccountHost: acc.imapHost,
              receivedAt: new Date(mail.date).toLocaleString('zh-CN'),
              dateRaw: mail.date,  // 保留原始 ISO 字符串，用于排序
              forwardStatus: hasActiveNotif ? 'forwarded' : 'no_channel',
              forwardTarget: hasActiveNotif ? '微信通知' : undefined,
              snippet: mail.snippet || '',
            })
          }
        }
      }

      allLogs.sort((a, b) => {
        // 直接比较 ISO 时间戳，避免用本地化字符串做二次解析
        const da = new Date(a.dateRaw).getTime();
        const db = new Date(b.dateRaw).getTime();
        return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da);
      })
      setLogs(allLogs)

      if (allLogs.length > 0) {
        triggerToast('已加载 ' + allLogs.length + ' 条邮件日志', 'success')
      }
    } catch (error: any) {
      console.error('加载日志失败:', error)
    } finally {
      setLoading(false)
    }
  }, [triggerToast])

  useEffect(() => { fetchAllLogs() }, [])

  // 强制同步所有邮箱账户
  const syncAllAccounts = useCallback(async () => {
    setSyncing(true)
    try {
      const emailsRes = await emailApi.getAll()
      if (!emailsRes.success) {
        triggerToast('获取邮箱列表失败', 'error')
        return
      }
      const accs = emailsRes.data
      const results = await Promise.allSettled(
        accs.map(acc => emailApi.sync(acc.id))
      )
      let totalNew = 0
      let failed = 0
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.success) {
          totalNew += r.value.data.newCount
        } else {
          failed++
        }
      }
      if (failed > 0) {
        triggerToast(`同步完成，${failed} 个账户同步失败`, 'warning')
      } else if (totalNew > 0) {
        triggerToast(`同步完成，新增 ${totalNew} 封邮件`, 'success')
      } else {
        triggerToast('同步完成，暂无新邮件', 'info')
      }
      // Refresh the log list after sync
      await fetchAllLogs()
    } catch (error: any) {
      console.error('同步失败:', error)
      triggerToast('同步失败: ' + (error.message || '未知错误'), 'error')
    } finally {
      setSyncing(false)
    }
  }, [triggerToast, fetchAllLogs])

  // 展开/收起邮件正文（参照邮箱账户管理页的 handleToggleBody）
  const handleToggleBody = async (log: EmailLog) => {
    if (expandedLogId === log.id) {
      setExpandedLogId(null)
      setExpandedBody('')
      return
    }

    setExpandedLogId(log.id)
    setExpandedBody('')
    setLoadingBody(true)

    const accountId = log.toAccountId
    const uid = log.uid

    if (!accountId || uid == null) {
      setExpandedBody(log.snippet || '（无法获取正文：缺少账户或 UID 信息）')
      setLoadingBody(false)
      return
    }

    try {
      const result = await emailApi.fetchBody(accountId, uid)
      if (result.success) {
        setExpandedBody(result.data.text || result.data.html || '（无正文内容）')
      } else {
        setExpandedBody(log.snippet || '获取正文失败')
      }
    } catch (error: any) {
      setExpandedBody(log.snippet || `获取失败: ${error.message}`)
    } finally {
      setLoadingBody(false)
    }
  }

  // 邮箱列表（去重）
  const mailboxOptions = useMemo(() => {
    const map = new Map<string, { id: string; email: string; host: string }>()
    for (const acc of accounts) {
      map.set(acc.id, { id: acc.id, email: acc.email, host: acc.imapHost })
    }
    return Array.from(map.values())
  }, [accounts])

  // 过滤
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchSearch =
        log.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.senderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.senderEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.toEmail.toLowerCase().includes(searchTerm.toLowerCase())

      const matchStatus = statusFilter === 'all' || log.forwardStatus === statusFilter
      const matchMailbox = mailboxFilter === 'all' || (log as any).toAccountId === mailboxFilter

      return matchSearch && matchStatus && matchMailbox
    })
  }, [logs, searchTerm, statusFilter, mailboxFilter])

  // 统计
  const stats = useMemo(() => ({
    total: logs.length,
    forwarded: logs.filter(l => l.forwardStatus === 'forwarded').length,
    noChannel: logs.filter(l => l.forwardStatus === 'no_channel').length,
    failed: logs.filter(l => l.forwardStatus === 'failed').length,
    accounts: accounts.length,
  }), [logs, accounts])

  const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    forwarded: { label: '已推送', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
    sending: { label: '推送中', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30', icon: <Send className="w-3 h-3" /> },
    failed: { label: '已拦截', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: <AlertTriangle className="w-3 h-3" /> },
    no_channel: { label: '未配置', color: 'text-slate-400 bg-slate-500/10 border-slate-500/30', icon: <Inbox className="w-3 h-3" /> },
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* ── 固定区域：标题 / 统计 / 搜索 / 筛选 ── */}
      <div className="shrink-0 px-4 md:px-6 pt-4 md:pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#E6EDF3] tracking-tight font-display">仪表盘 / Dashboard</h1>
            <p className="text-[#8B949E] text-xs mt-0.5">实时监控邮件接收与微信推送状态</p>
          </div>
          <div className="flex items-center gap-2">
            {/* SSE 连接状态 */}
            <span className={'flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono border ' +
              (isConnected
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                : 'text-amber-400 bg-amber-500/10 border-amber-500/30')}>
              <span className={'w-1.5 h-1.5 rounded-full ' + (isConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse')} />
              {isConnected ? 'SSE' : '连接中'}
            </span>
            <button onClick={syncAllAccounts} disabled={syncing || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-50 cursor-pointer">
              <Radio className={'w-3.5 h-3.5 ' + (syncing ? 'animate-spin' : '')} />
              <span>{syncing ? '同步中...' : '同步邮箱'}</span>
            </button>
            <button onClick={fetchAllLogs} disabled={loading || syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-[#30363D] bg-[#161B22] text-[#C9D1D9] hover:bg-[#21262d] disabled:opacity-50 cursor-pointer">
              <RefreshCw className={'w-3.5 h-3.5 ' + (loading ? 'animate-spin text-blue-400' : '')} />
              <span>{loading ? '加载中...' : '刷新日志'}</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: '邮箱账户', value: stats.accounts, icon: <Server className="w-4 h-4 text-blue-400" />, color: 'border-blue-500/20' },
            { label: '邮件总数', value: stats.total, icon: <Mail className="w-4 h-4 text-[#58A6FF]" />, color: 'border-[#58A6FF]/20' },
            { label: '已推送', value: stats.forwarded, icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, color: 'border-emerald-500/20' },
            { label: '未配置通知', value: stats.noChannel, icon: <Inbox className="w-4 h-4 text-slate-400" />, color: 'border-slate-500/20' },
          ].map((stat, i) => (
            <div key={i} className={'p-3 rounded-lg border ' + stat.color + ' bg-[#161B22] flex items-center gap-3'}>
              <div className="p-2 rounded-md bg-[#0D1117]">{stat.icon}</div>
              <div>
                <div className="text-lg font-bold text-[#E6EDF3] font-mono">{stat.value}</div>
                <div className="text-[10px] text-slate-500">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 未配置通知提示 */}
        {!hasNotification && logs.length > 0 && (
          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg flex items-center gap-2 text-amber-400 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>尚未配置微信通知通道，邮件接收后不会自动推送。请前往「微信通知」页面配置。</span>
          </div>
        )}

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input type="text" placeholder="搜索主题、发件人..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#C9D1D9] text-xs focus:outline-none focus:border-[#58A6FF]" />
          </div>

          {/* 邮箱筛选 */}
          <select value={mailboxFilter} onChange={e => setMailboxFilter(e.target.value)}
            className="px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#C9D1D9] text-xs focus:outline-none cursor-pointer min-w-[140px]">
            <option value="all">全部邮箱</option>
            {mailboxOptions.map(m => (
              <option key={m.id} value={m.id}>{m.email}</option>
            ))}
          </select>

          {/* 状态筛选 */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-lg text-[#C9D1D9] text-xs focus:outline-none cursor-pointer">
            <option value="all">全部状态</option>
            <option value="forwarded">已推送</option>
            <option value="no_channel">未配置</option>
            <option value="failed">已拦截</option>
          </select>
        </div>
      </div>

      {/* ── 可滚动区域：邮件列表 ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-4">
        {/* 新邮件提示横幅 */}
        {newEmailCount > 0 && (
          <button
            onClick={() => setNewEmailCount(0)}
            className="w-full mb-3 px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-medium flex items-center justify-center gap-2 hover:bg-blue-500/20 transition-colors cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5" />
            收到 {newEmailCount} 封新邮件，已自动添加到列表
          </button>
        )}

        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-[#8B949E]">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            <span>正在加载邮件日志...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#8B949E]">
            <Mail className="w-10 h-10 mb-3 opacity-30" />
            <span className="text-sm">暂无邮件日志</span>
            <span className="text-xs mt-1">添加邮箱后，邮件将自动显示在这里</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            <AnimatePresence>
              {filteredLogs.map((log) => {
                const status = statusConfig[log.forwardStatus] || statusConfig['no_channel']
                const isExpanded = expandedLogId === log.id
                const provider = getProvider((log as any).toAccountHost || '')
                const pc = providerConfig[provider] || providerConfig.custom

                return (
                  <motion.div key={log.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="rounded-lg border border-[#30363D] bg-[#161B22] overflow-hidden">
                    <div onClick={() => handleToggleBody(log)}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#1F242C]/50 transition-colors">

                      {/* 邮箱图标 */}
                      <div className={'w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ' + pc.bg}>
                        <span className={'text-[10px] font-bold ' + pc.color}>{pc.name}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs text-[#E6EDF3] font-medium truncate">{log.subject}</span>
                          <span className={'flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border ' + status.color}>
                            {status.icon}
                            {status.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span className="truncate">{log.senderName}</span>
                          <span className="shrink-0">→</span>
                          <span className="font-mono truncate">{log.toEmail}</span>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-500 font-mono whitespace-nowrap shrink-0">{log.receivedAt}</div>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden">
                          <div className="px-4 py-3 border-t border-[#30363D] bg-[#0D1117] text-xs">
                            {/* 邮件头部信息 */}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400 mb-3 pb-2.5 border-b border-[#30363D]/60">
                              <span>发件人: <span className="text-slate-300">{log.senderEmail || log.senderName}</span></span>
                              <span>收件箱: <span className="text-slate-300 font-mono">{log.toEmail}</span></span>
                              {log.forwardTarget && <span>推送至: <span className="text-blue-400">{log.forwardTarget}</span></span>}
                            </div>
                            {/* 邮件正文 */}
                            {loadingBody && expandedLogId === log.id ? (
                              <div className="flex items-center gap-2 text-[#8B949E] py-3">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>正在加载邮件正文...</span>
                              </div>
                            ) : (
                              <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto font-sans">
                                {expandedBody || log.snippet || '（无正文内容）'}
                              </pre>
                            )}
                            {log.errorDetails && <p className="text-amber-400 text-[10px] mt-2 pt-2 border-t border-[#30363D]/60">{log.errorDetails}</p>}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
