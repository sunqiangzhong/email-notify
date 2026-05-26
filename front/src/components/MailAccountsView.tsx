import React, { useState } from 'react';
import {
  Plus,
  Mail,
  Shield,
  Server,
  Trash2,
  RefreshCw,
  Activity,
  Check,
  X,
  ShieldAlert,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { MailAccount, MailProvider } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { emailApi } from '../services/api';

interface MailAccountsViewProps {
  accounts: MailAccount[];
  setAccounts: React.Dispatch<React.SetStateAction<MailAccount[]>>;
  triggerToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function MailAccountsView({
  accounts,
  setAccounts,
  triggerToast
}: MailAccountsViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 最近邮件列表状态
  const [viewingEmailId, setViewingEmailId] = useState<string | null>(null);
  const [viewingEmailName, setViewingEmailName] = useState('');
  const [recentEmails, setRecentEmails] = useState<Array<{
    uid: number;
    id: string;
    fromName: string;
    fromAddress: string;
    subject: string;
    snippet: string;
    date: string;
    hasAttachments: boolean;
    attachmentsCount: number;
  }>>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [emailPagination, setEmailPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  // 展开正文状态
  const [expandedUid, setExpandedUid] = useState<number | null>(null);
  const [expandedBody, setExpandedBody] = useState('');
  const [loadingBody, setLoadingBody] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [provider, setProvider] = useState<MailProvider>('qq');
  const [imapHost, setImapHost] = useState('imap.qq.com');
  const [imapPort, setImapPort] = useState(993);
  const [ssl, setSsl] = useState(true);

  // 代理相关状态
  const [useProxy, setUseProxy] = useState(false);
  const [proxyList, setProxyList] = useState<Array<{ id: string; name: string; type: string; host: string; port: number }>>([]);
  const [selectedProxyId, setSelectedProxyId] = useState<string>('');

  // Auto-fill configuration helpers when provider changes
  const handleProviderSelect = (selected: MailProvider) => {
    setProvider(selected);
    if (selected === 'qq') {
      setImapHost('imap.qq.com');
      setImapPort(993);
      setSsl(true);
    } else if (selected === 'gmail') {
      setImapHost('imap.gmail.com');
      setImapPort(993);
      setSsl(true);
    } else if (selected === 'outlook') {
      setImapHost('imap-mail.outlook.com');
      setImapPort(993);
      setSsl(true);
    } else {
      setImapHost('');
      setImapPort(143);
      setSsl(false);
    }
  };

  // Add new account via API
  const handleAddNewAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name) {
      triggerToast('请输入邮箱名称', 'error');
      return;
    }
    if (!email) {
      triggerToast('请输入邮箱地址', 'error');
      return;
    }
    if (!email.includes('@')) {
      triggerToast('请输入合法的邮箱格式', 'warning');
      return;
    }
    if (!authCode) {
      triggerToast('请输入授权码或登录密码', 'error');
      return;
    }
    if (!imapHost) {
      triggerToast('请输入 IMAP 主机地址', 'error');
      return;
    }

    setSubmitting(true);
    triggerToast(`正在连接 ${imapHost}:${imapPort} 验证凭证...`, 'info');

    // 获取选中的代理信息
    const selectedProxy = useProxy && selectedProxyId ? proxyList.find(p => p.id === selectedProxyId) : null;

    try {
      // 先测试连接
      const testResult = await emailApi.testConnection({
        email,
        password: authCode,
        imapHost,
        imapPort,
        useSSL: ssl,
        useProxy: !!selectedProxy,
        proxyHost: selectedProxy?.host,
        proxyPort: selectedProxy?.port,
        proxyType: selectedProxy?.type,
      });

      if (!testResult.success) {
        triggerToast(`连接失败: ${testResult.message}`, 'error');
        setSubmitting(false);
        return;
      }

      // 连接成功，创建邮箱
      const result = await emailApi.create({
        name,
        email,
        password: authCode,
        imapHost,
        imapPort,
        useSSL: ssl,
        useProxy: !!selectedProxy,
        proxyId: selectedProxy?.id || null,
        active: true,
      });

      if (result.success) {
        const newAccount: MailAccount = {
          id: result.data.id,
          email: result.data.email,
          type: provider,
          status: 'online',
          imapHost: result.data.imapHost,
          imapPort: result.data.imapPort,
          ssl: result.data.useSSL,
          lastChecked: new Date().toLocaleString('zh-CN'),
        };

        setAccounts(prev => [...prev, newAccount]);
        setIsModalOpen(false);
        triggerToast(`邮箱 ${email} 验证通过，已成功加入实时守护侦听队列`, 'success');

        // Reset form
        setName('');
        setEmail('');
        setAuthCode('');
        handleProviderSelect('qq');
      }
    } catch (error: any) {
      triggerToast(`操作失败: ${error.message || '服务器错误'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Test single account IMAP connection（已有邮箱用存储密码）
  const handleTestConnection = async (id: string, emailStr: string) => {
    setTestingId(id);
    triggerToast(`正在诊断 ${emailStr} 的 IMAP 协议链路...`, 'info');

    try {
      const result = await emailApi.testExistingConnection(id);

      if (result.success) {
        setAccounts(prev => prev.map(acc => {
          if (acc.id === id) {
            return {
              ...acc,
              status: 'online' as const,
              lastChecked: new Date().toLocaleString('zh-CN'),
            };
          }
          return acc;
        }));
        triggerToast(`${emailStr} 连接成功！响应时间: ${result.data?.responseTime || 0}ms`, 'success');
      } else {
        setAccounts(prev => prev.map(acc => {
          if (acc.id === id) {
            return { ...acc, status: 'error' as const };
          }
          return acc;
        }));
        triggerToast(`连接失败: ${result.message}`, 'error');
      }
    } catch (error: any) {
      triggerToast(`诊断失败: ${error.message || '网络错误'}`, 'error');
    } finally {
      setTestingId(null);
    }
  };

  // Delete single account
  const handleDeleteAccount = async (id: string, emailStr: string) => {
    if (!confirm(`确认要解绑并移出该邮箱账号吗？\n${emailStr}\n\n移出后将中断实时的微信通知提醒。`)) {
      return;
    }

    try {
      const result = await emailApi.delete(id);
      if (result.success) {
        setAccounts(prev => prev.filter(acc => acc.id !== id));
        triggerToast(`已安全移出邮箱账户: ${emailStr}`, 'success');
      }
    } catch (error: any) {
      triggerToast(`删除失败: ${error.message || '服务器错误'}`, 'error');
    }
  };

  // 拉取最近邮件
  const handleViewEmails = async (id: string, emailStr: string, page: number = 1) => {
    if (!viewingEmailId || viewingEmailId !== id) {
      setViewingEmailId(id);
      setViewingEmailName(emailStr);
    }
    setLoadingEmails(true);
    if (page === 1) setRecentEmails([]);

    try {
      const result = await emailApi.fetchRecent(id, page, 10);
      if (result.success) {
        setRecentEmails(result.data);
        setEmailPagination(result.pagination);
        if (page === 1) {
          triggerToast(`成功拉取 ${result.data.length} 封邮件`, 'success');
        }
      } else {
        triggerToast(`拉取失败: ${result.message}`, 'error');
      }
    } catch (error: any) {
      triggerToast(`拉取失败: ${error.message || '网络错误'}`, 'error');
    } finally {
      setLoadingEmails(false);
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  // 展开/收起邮件正文
  const handleToggleBody = async (emailId: string, uid: number) => {
    if (expandedUid === uid) {
      setExpandedUid(null);
      setExpandedBody('');
      return;
    }

    setExpandedUid(uid);
    setExpandedBody('');
    setLoadingBody(true);

    try {
      const result = await emailApi.fetchBody(emailId, uid);
      if (result.success) {
        setExpandedBody(result.data.text || result.data.html || '（无正文内容）');
      } else {
        setExpandedBody('获取正文失败');
      }
    } catch (error: any) {
      setExpandedBody(`获取失败: ${error.message}`);
    } finally {
      setLoadingBody(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#E6EDF3] tracking-tight font-display">邮箱账户管理</h1>
          <p className="text-[#8B949E] text-xs mt-0.5">多源收件箱密码与 IMAP 守护进程配置管理</p>
        </div>

        <button
          onClick={async () => {
            setIsModalOpen(true);
            // 加载代理列表
            try {
              const { proxyApi } = await import('../services/api');
              const res = await proxyApi.getAll();
              if (res.success) setProxyList(res.data);
            } catch (e) {}
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-all shadow-md cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>添加网关邮箱</span>
        </button>
      </div>

      {/* Grid of Mail Accounts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3">
        <AnimatePresence>
          {accounts.map((acc) => {
            const brandDetails = {
              qq: { name: 'QQ 邮箱', logo: '腾讯QQ', color: 'from-[#009bfa]/20 to-[#009bfa]/5 border-[#009bfa]/30 text-[#009bfa]' },
              gmail: { name: 'Gmail', logo: 'Google', color: 'from-[#ea4335]/20 to-[#ea4335]/5 border-[#ea4335]/30 text-[#ea4335]' },
              outlook: { name: 'Outlook', logo: 'Microsoft', color: 'from-[#0078d4]/20 to-[#0078d4]/5 border-[#0078d4]/30 text-[#0078d4]' },
              custom: { name: '自定义 IMAP', logo: 'IMAP', color: 'from-slate-700/30 to-slate-705/10 border-slate-750 text-slate-300' },
            }[acc.type];

            const isOnline = acc.status === 'online';

            return (
              <motion.div
                key={acc.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="rounded-lg border border-[#30363D] bg-[#161B22] p-4 flex flex-col justify-between overflow-hidden relative group/card"
              >
                <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${brandDetails.color} opacity-10 blur-2xl rounded-full`}></div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border tracking-wide uppercase ${brandDetails.color}`}>
                        {brandDetails.logo}
                      </span>
                      <h3 className="font-semibold text-[#E6EDF3] text-sm font-sans">{brandDetails.name}</h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">
                        {isOnline ? '正常连接' : '连接异常'}
                      </span>
                      <span className="relative flex h-2 w-2">
                        {isOnline && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        )}
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-[#3FB950]' : 'bg-[#F85149]'}`}></span>
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[#E6EDF3] font-medium font-sans truncate text-xs">{acc.email}</span>
                    </div>
                    <div className="grid grid-cols-2 mt-2.5 p-2.5 bg-[#0D1117] rounded-md border border-[#30363D] font-mono text-[10px] text-slate-400 gap-y-1">
                      <div className="flex items-center gap-1">
                        <Server className="w-3 h-3 text-slate-500" />
                        <span className="text-slate-500">Host:</span>
                      </div>
                      <div className="truncate text-slate-300 text-right">{acc.imapHost}</div>

                      <div className="flex items-center gap-1">
                        <Shield className="w-3 h-3 text-slate-500" />
                        <span className="text-slate-500">Security:</span>
                      </div>
                      <div className="text-right">
                        <span className="px-1 py-0.5 rounded bg-[#161B22] text-[#C9D1D9] text-[9px] font-semibold border border-[#30363D]/60">
                          SSL {acc.ssl ? 'ON' : 'OFF'}
                        </span>
                        <span className="ml-1 text-slate-400">Port {acc.imapPort}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#30363D] text-[10px]">
                  <span className="text-[#8B949E] font-mono">
                    活跃轮询: {acc.lastChecked ? acc.lastChecked.split(' ')[1] : '从未'}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleViewEmails(acc.id, acc.email)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#30363D] bg-[#161B22] hover:bg-[#21262d] text-[#58A6FF] hover:text-[#79C0FF] transition-all font-medium cursor-pointer"
                    >
                      <Mail className="w-3 h-3" />
                      <span>查看邮件</span>
                    </button>

                    <button
                      onClick={() => handleTestConnection(acc.id, acc.email)}
                      disabled={testingId === acc.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#30363D] bg-[#161B22] hover:bg-[#21262d] text-[#C9D1D9] hover:text-[#E6EDF3] transition-all disabled:opacity-50 font-medium cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${testingId === acc.id ? 'animate-spin text-blue-400' : ''}`} />
                      <span>{testingId === acc.id ? '连接中' : '测试连接'}</span>
                    </button>

                    <button
                      onClick={() => handleDeleteAccount(acc.id, acc.email)}
                      className="p-1 rounded-md border border-transparent text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 hover:border-rose-900/30 transition-all cursor-pointer"
                      title="解绑邮箱"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Add mailbox credentials Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-xs" onClick={() => setIsModalOpen(false)} />

            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 10 }}
                className="relative bg-[#161B22] border border-[#30363D] rounded-md w-full max-w-md overflow-hidden shadow-2xl pointer-events-auto"
              >
              <div className="p-4 border-b border-[#30363D] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[#E6EDF3] font-display">添加新邮箱网关</h2>
                  <p className="text-[11px] text-[#8B949E] mt-0.5">系统将基于 IMAP/SMTP 建立安全连接并聚合接收流</p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-md text-[#8B949E] hover:text-white hover:bg-[#1F242C] transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddNewAccount} className="p-4 space-y-3.5 text-xs">
                {/* Choose Provider */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#8B949E]">选择邮件服务商</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'qq', label: '腾讯QQ', type: 'qq' },
                      { id: 'gmail', label: 'Gmail', type: 'gmail' },
                      { id: 'outlook', label: 'Outlook', type: 'outlook' },
                      { id: 'custom', label: '自定义', type: 'custom' },
                    ].map((prov) => {
                      const isSelected = provider === prov.type;
                      return (
                        <button
                          key={prov.id}
                          type="button"
                          onClick={() => handleProviderSelect(prov.type as MailProvider)}
                          className={`py-1.5 rounded text-[11px] font-semibold text-center border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#1F242C] border-[#30363D] text-[#58A6FF]'
                              : 'bg-[#0D1117] border-[#30363D] text-[#8B949E] hover:text-[#C9D1D9] hover:bg-[#1F242C]/50'
                          }`}
                        >
                          {prov.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Name */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#8B949E]">邮箱名称</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 我的QQ邮箱"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-sans"
                  />
                </div>

                {/* Email address */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-semibold text-[#8B949E]">邮箱地址</label>
                    {provider === 'gmail' && (
                      <span className="text-[9px] text-[#D29922] flex items-center gap-0.5">
                        <ShieldAlert className="w-3 h-3" />
                        需要全局代理支持
                      </span>
                    )}
                  </div>
                  <input
                    type="email"
                    required
                    placeholder={
                      provider === 'qq'
                        ? 'e.g. yourname@qq.com'
                        : provider === 'gmail'
                        ? 'e.g. yourname@gmail.com'
                        : 'e.g. security-logs@yourcompany.com'
                    }
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-sans"
                  />
                </div>

                {/* Auth code */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-semibold text-[#8B949E]">IMAP 独立授权码 / 密码</label>
                    <span className="text-[9px] text-[#58A6FF]">非邮箱正统登录密码</span>
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="请输入第三方登录专用专属授权密码"
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-sans"
                  />
                </div>

                {/* IMAP Host and Port */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#8B949E]">IMAP 服务器</label>
                    <input
                      type="text"
                      required
                      placeholder="imap.yourserver.com"
                      value={imapHost}
                      onChange={(e) => setImapHost(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#8B949E]">服务器端口</label>
                    <input
                      type="number"
                      required
                      value={imapPort}
                      onChange={(e) => setImapPort(parseInt(e.target.value) || 993)}
                      className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-mono"
                    />
                  </div>
                </div>

                {/* SSL toggle */}
                <div className="flex items-center justify-between p-2.5 bg-[#0D1117] rounded-md border border-[#30363D] mt-1">
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium text-[#C9D1D9] block">开启 SSL 安全加密</span>
                    <span className="text-[10px] text-slate-500 font-sans block">使用 SSL/TLS 进行安全信道传输保护</span>
                  </div>
                  <button type="button" onClick={() => setSsl(!ssl)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 focus:outline-none ${ssl ? 'bg-blue-600' : 'bg-zinc-800'}`}>
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${ssl ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Proxy toggle */}
                <div className="p-2.5 bg-[#0D1117] rounded-md border border-[#30363D] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-[#C9D1D9] block">通过代理连接</span>
                      <span className="text-[10px] text-slate-500 block">Gmail 等海外邮箱需要代理才能连接</span>
                    </div>
                    <button type="button" onClick={() => setUseProxy(!useProxy)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 focus:outline-none ${useProxy ? 'bg-blue-600' : 'bg-zinc-800'}`}>
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${useProxy ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {useProxy && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-[#8B949E]">选择代理</label>
                      {proxyList.length === 0 ? (
                        <p className="text-[10px] text-amber-400">暂无代理配置，请先在「代理设置」页面添加</p>
                      ) : (
                        <select value={selectedProxyId} onChange={e => setSelectedProxyId(e.target.value)}
                          className="w-full px-3 py-1.5 bg-[#161B22] border border-[#30363D] rounded-md text-[#C9D1D9] text-xs focus:outline-none focus:border-[#58A6FF] cursor-pointer">
                          <option value="">请选择代理</option>
                          {proxyList.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.type}://{p.host}:{p.port})</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>

                {/* Form buttons */}
                <div className="flex justify-end gap-2 pt-3 border-t border-[#30363D] mt-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-3 py-1.5 rounded-md text-[#8B949E] hover:text-white bg-[#1D2128] border border-[#30363D] hover:bg-[#21262d] transition-all text-xs font-semibold cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white bg-blue-600 hover:bg-blue-500 transition-all text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>连接中...</span>
                      </>
                    ) : (
                      <>
                        <span>测试并添加守护</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* 查看最近邮件弹窗 */}
      <AnimatePresence>
        {viewingEmailId && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-xs" onClick={() => setViewingEmailId(null)} />

            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative bg-[#161B22] border border-[#30363D] rounded-md w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col pointer-events-auto"
              >
              {/* 弹窗头部 */}
              <div className="p-4 border-b border-[#30363D] flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-sm font-semibold text-[#E6EDF3] font-display">📬 最近邮件列表</h2>
                  <p className="text-[11px] text-[#8B949E] mt-0.5">{viewingEmailName} — 最近 10 封</p>
                </div>
                <button
                  onClick={() => setViewingEmailId(null)}
                  className="p-1 rounded-md text-[#8B949E] hover:text-white hover:bg-[#1F242C] transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 邮件列表 - 表格布局 */}
              <div className="flex-1 overflow-y-auto">
                {loadingEmails ? (
                  <div className="flex items-center justify-center py-12 text-[#8B949E]">
                    <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                    <span>正在拉取邮件...</span>
                  </div>
                ) : recentEmails.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-[#8B949E]">
                    <span>暂无邮件数据</span>
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#30363D] text-[#8B949E] text-left">
                        <th className="px-4 py-2.5 font-medium w-[180px]">发件人</th>
                        <th className="px-4 py-2.5 font-medium">内容</th>
                        <th className="px-4 py-2.5 font-medium w-[100px] text-right">时间</th>
                        <th className="px-4 py-2.5 font-medium w-[70px] text-center">已读</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentEmails.map((mail, idx) => (
                        <React.Fragment key={mail.id}>
                          <tr
                            onClick={() => handleToggleBody(viewingEmailId!, mail.uid)}
                            className={`border-b border-[#30363D]/50 hover:bg-[#1F242C]/50 transition-colors cursor-pointer ${
                              expandedUid === mail.uid ? 'bg-[#1F242C]' : idx % 2 === 0 ? 'bg-transparent' : 'bg-[#0D1117]/30'
                            }`}
                          >
                            {/* 发件人 */}
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-[#1F242C] border border-[#30363D] flex items-center justify-center text-[10px] text-[#58A6FF] font-bold shrink-0">
                                  {(mail.fromName || '?').charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[#E6EDF3] font-medium truncate">{mail.fromName || '未知'}</div>
                                  {mail.fromAddress && (
                                    <div className="text-[10px] text-slate-500 truncate">{mail.fromAddress}</div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 内容 */}
                            <td className="px-4 py-2.5">
                              <div className="text-[#E6EDF3] font-medium truncate">{mail.subject}</div>
                              {mail.snippet && (
                                <div className="text-[10px] text-slate-400 truncate mt-0.5">{mail.snippet}</div>
                              )}
                            </td>

                            {/* 时间 */}
                            <td className="px-4 py-2.5 text-right text-slate-400 font-mono whitespace-nowrap">
                              {formatDate(mail.date)}
                            </td>

                            {/* 是否已读 */}
                            <td className="px-4 py-2.5 text-center">
                              <span className="inline-block w-2 h-2 rounded-full bg-[#58A6FF]"></span>
                            </td>
                          </tr>

                          {/* 展开正文行 */}
                          {expandedUid === mail.uid && (
                            <tr>
                              <td colSpan={4} className="px-4 py-3 bg-[#0D1117] border-b border-[#30363D]/50">
                                {loadingBody ? (
                                  <div className="flex items-center gap-2 text-[#8B949E] text-xs py-2">
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span>加载正文...</span>
                                  </div>
                                ) : (
                                  <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto font-sans">
                                    {expandedBody}
                                  </pre>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* 分页底栏 */}
              <div className="p-3 border-t border-[#30363D] flex justify-between items-center shrink-0">
                <span className="text-[10px] text-slate-500">
                  共 {emailPagination.total} 封 · 第 {emailPagination.page}/{emailPagination.totalPages || 1} 页
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewEmails(viewingEmailId!, viewingEmailName, emailPagination.page - 1)}
                    disabled={loadingEmails || emailPagination.page <= 1}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold border border-[#30363D] bg-[#161B22] text-[#C9D1D9] hover:bg-[#21262d] transition-all disabled:opacity-30 cursor-pointer"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => handleViewEmails(viewingEmailId!, viewingEmailName, emailPagination.page + 1)}
                    disabled={loadingEmails || emailPagination.page >= emailPagination.totalPages}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold border border-[#30363D] bg-[#161B22] text-[#C9D1D9] hover:bg-[#21262d] transition-all disabled:opacity-30 cursor-pointer"
                  >
                    下一页
                  </button>
                  <button
                    onClick={() => handleViewEmails(viewingEmailId!, viewingEmailName, 1)}
                    disabled={loadingEmails}
                    className="p-1.5 rounded-md border border-[#30363D] bg-[#161B22] text-[#C9D1D9] hover:bg-[#21262d] transition-all disabled:opacity-30 cursor-pointer"
                    title="刷新"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingEmails ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
            </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
