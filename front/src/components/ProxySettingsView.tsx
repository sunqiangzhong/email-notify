import React, { useState, useEffect } from 'react';
import {
  Globe,
  Wifi,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  User,
  Lock,
  Terminal,
  Activity,
  Cpu,
  Unplug,
  Trash2,
  Edit2,
  List,
  Plus
} from 'lucide-react';
import { ProxyConfig, ProxyType } from '../types';
import { proxyApi, connectivityApi, ConnectivityResult, ProxyData } from '../services/api';

interface ProxySettingsViewProps {
  proxyConfig: ProxyConfig;
  setProxyConfig: React.Dispatch<React.SetStateAction<ProxyConfig>>;
  triggerToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function ProxySettingsView({
  proxyConfig,
  setProxyConfig,
  triggerToast
}: ProxySettingsViewProps) {
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverLatency, setServerLatency] = useState<number | null | undefined>(proxyConfig.latency);

  // 代理列表
  const [proxyList, setProxyList] = useState<ProxyData[]>([]);
  const [loadingProxies, setLoadingProxies] = useState(false);
  const [deletingProxy, setDeletingProxy] = useState<string | null>(null);

  // 连通性测试结果
  const [connTestResults, setConnTestResults] = useState<ConnectivityResult[]>([]);
  const [proxyReachable, setProxyReachable] = useState<boolean | null>(null);
  const [connTesting, setConnTesting] = useState(false);
  const [testingSite, setTestingSite] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(proxyConfig.enabled);
  const [type, setType] = useState<ProxyType>(proxyConfig.type);
  const [host, setHost] = useState(proxyConfig.host);
  const [port, setPort] = useState(proxyConfig.port);
  const [username, setUsername] = useState(proxyConfig.username || '');
  const [password, setPassword] = useState(proxyConfig.password || '');
  const [proxyId, setProxyId] = useState<string | undefined>(proxyConfig.id);

  // 加载代理列表
  useEffect(() => {
    loadProxyList();
  }, []);

  const loadProxyList = async () => {
    setLoadingProxies(true);
    try {
      const result = await proxyApi.getAll();
      if (result.success) {
        setProxyList(result.data);
      }
    } catch (error: any) {
      console.error('加载代理列表失败:', error);
    } finally {
      setLoadingProxies(false);
    }
  };

  // 删除代理
  const handleDeleteProxy = async (proxyIdToDelete: string) => {
    if (!confirm('确定要删除这个代理配置吗？')) {
      return;
    }

    setDeletingProxy(proxyIdToDelete);
    try {
      const result = await proxyApi.delete(proxyIdToDelete);
      if (result.success) {
        triggerToast('代理删除成功', 'success');

        // 如果删除的是当前正在编辑的代理，清空表单
        if (proxyId === proxyIdToDelete) {
          setProxyId(undefined);
          setHost('');
          setPort(0);
          setUsername('');
          setPassword('');
          setProxyConfig({
            enabled: false,
            type: 'SOCKS5',
            host: '',
            port: 0,
          });
        }

        // 重新加载列表
        await loadProxyList();
      }
    } catch (error: any) {
      triggerToast(`删除失败: ${error.message || '服务器错误'}`, 'error');
    } finally {
      setDeletingProxy(null);
    }
  };

  // 编辑代理（加载到表单）
  const handleEditProxy = (proxy: ProxyData) => {
    setProxyId(proxy.id);
    setType(proxy.type.toUpperCase() as ProxyType);
    setHost(proxy.host);
    setPort(proxy.port);
    setUsername(proxy.username || '');
    setPassword(proxy.password || '');
    setEnabled(true);
    triggerToast('已加载代理配置，可进行编辑', 'info');
  };

  // Save proxy config via API
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();

    if (enabled && (!host || !port)) {
      triggerToast('网络主机地址和端口不能为空！', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: `代理-${type}`,
        type: type.toLowerCase() as any,
        host,
        port,
        username: username || null,
        password: password || null,
      };

      // 有 ID 用 update，没有用 create（后端 create 也已幂等）
      const result = proxyId
        ? await proxyApi.update(proxyId, payload)
        : await proxyApi.create(payload);

      if (result.success) {
        // 保存返回的 ID，后续更新用
        const returnedId = result.data?.id || proxyId;
        setProxyId(returnedId);

        const updated: ProxyConfig = {
          id: returnedId,
          enabled,
          type,
          host,
          port,
          username: username || undefined,
          password: password || undefined,
          latency: serverLatency ?? null,
        };
        setProxyConfig(updated);
        triggerToast('代理路由配置已安全保存至服务器！', 'success');

        // 重新加载代理列表
        await loadProxyList();
      }
    } catch (error: any) {
      triggerToast(`保存失败: ${error.message || '服务器错误'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Toggle proxy enabled state
  const handleToggle = async () => {
    const newEnabled = !enabled;
    setEnabled(newEnabled);

    if (newEnabled && host && port) {
      // 启用时自动保存（后端幂等：同 host+port 只会更新，不会新建）
      try {
        const payload = {
          name: `代理-${type}`,
          type: type.toLowerCase() as any,
          host,
          port,
          username: username || null,
          password: password || null,
        };
        const result = proxyId
          ? await proxyApi.update(proxyId, payload)
          : await proxyApi.create(payload);
        if (result.success && result.data?.id) {
          setProxyId(result.data.id);
        }
      } catch (e) {
        // 忽略保存错误
      }
    }

    setProxyConfig(prev => ({ ...prev, enabled: newEnabled }));
    triggerToast(`网络通道已切换为：${newEnabled ? '全局代理路由' : '本地宿主直连'}`, 'info');
  };

  // 多场景连通性测试（测试全部）
  const runConnectivityTest = async () => {
    setConnTesting(true);
    setConnTestResults([]);
    setProxyReachable(null);
    triggerToast('正在测试各站点连通性...', 'info');

    try {
      const proxyCfg = (enabled && host && port)
        ? { host, port: parseInt(String(port)), type: type.toLowerCase() }
        : undefined;

      const result = await connectivityApi.testAll({
        proxyConfig: proxyCfg,
        categories: ['email'],
      });

      if (result.success) {
        setProxyReachable(result.data.proxy?.reachable ?? null);
        setConnTestResults(result.data.targets);

        const s = result.data.summary;
        const msg = result.data.proxy
          ? (result.data.proxy.reachable
            ? `代理可达，${s.success}/${s.total} 个站点连通`
            : '代理不可达，以直连模式测试')
          : `${s.success}/${s.total} 个站点连通`;
        triggerToast(msg, s.failed === 0 ? 'success' : 'warning');
      }
    } catch (error: any) {
      triggerToast('测试失败: ' + (error.message || '网络错误'), 'error');
    } finally {
      setConnTesting(false);
    }
  };

  // 单个站点测试（独立测试，不影响其他结果）
  const runSingleSiteTest = async (site: { name: string; host: string; port: number }) => {
    setTestingSite(site.host);
    try {
      const proxyCfg = (enabled && host && port)
        ? { host, port: parseInt(String(port)), type: type.toLowerCase() }
        : undefined;

      const result = await connectivityApi.testOne({
        name: site.name,
        host: site.host,
        port: site.port,
        proxyConfig: proxyCfg,
      });

      if (result.success) {
        // 只更新该站点的结果
        setConnTestResults(prev => {
          const filtered = prev.filter(r => r.host !== site.host);
          return [...filtered, result.data];
        });
        triggerToast(
          `${site.name}: ${result.data.success ? '连通 (' + result.data.latency + 'ms)' : '不通'}`,
          result.data.success ? 'success' : 'warning'
        );
      }
    } catch (e: any) {
      triggerToast(`${site.name} 测试失败: ${e.message || '网络错误'}`, 'error');
    } finally {
      setTestingSite(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#E6EDF3] tracking-tight font-display">代理路由器设置</h1>
          <p className="text-[#8B949E] text-xs mt-0.5">配置安全代理链路，保障国际收发及 IMAP 长链接稳定性</p>
        </div>

        <div className="flex items-center gap-2">
          {enabled ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#30363D] bg-[#161B22] text-[#3FB950] text-[11px] font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>代理守护已就绪</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#30363D] bg-[#161B22] text-[#8B949E] text-[11px] font-semibold">
              <Unplug className="w-3.5 h-3.5" />
              <span>直连模式运行</span>
            </div>
          )}
        </div>
      </div>

      {/* 已保存的代理列表 */}
      {proxyList.length > 0 && (
        <div className="p-4 rounded-lg border border-[#30363D] bg-[#161B22] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold text-[#8B949E] tracking-wider uppercase flex items-center gap-1.5">
              <List className="w-3.5 h-3.5 text-blue-400" />
              <span>已保存的代理配置</span>
            </h3>
            <button
              type="button"
              onClick={loadProxyList}
              disabled={loadingProxies}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border border-[#30363D] bg-[#0D1117] text-[#C9D1D9] hover:bg-[#1F242C] disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={'w-3 h-3 ' + (loadingProxies ? 'animate-spin' : '')} />
              <span>刷新</span>
            </button>
          </div>

          <div className="space-y-2">
            {proxyList.map((proxy) => (
              <div
                key={proxy.id}
                className="flex items-center justify-between p-3 rounded-md border border-[#30363D] bg-[#0D1117] hover:border-[#58A6FF] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0">
                    <Globe className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] text-[#E6EDF3] font-medium truncate">
                      {proxy.name || `${proxy.type.toUpperCase()} 代理`}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {proxy.type.toUpperCase()}:// {proxy.host}:{proxy.port}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEditProxy(proxy)}
                    className="p-1.5 rounded text-slate-500 hover:text-[#58A6FF] hover:bg-[#1F242C] cursor-pointer"
                    title="编辑此代理"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProxy(proxy.id)}
                    disabled={deletingProxy === proxy.id}
                    className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-50 cursor-pointer"
                    title="删除此代理"
                  >
                    {deletingProxy === proxy.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Form panel */}
        <div className="lg:col-span-8">
          <form onSubmit={handleSaveConfig} className="p-4 rounded-lg border border-[#30363D] bg-[#161B22] space-y-4">
            <div className="flex items-center justify-between p-3 rounded-md border border-[#30363D] bg-[#0D1117] gap-4">
              <div className="space-y-0.5 max-w-md">
                <h3 className="text-xs font-semibold text-[#E6EDF3]">全局代理状态</h3>
                <p className="text-[11px] text-[#8B949E] leading-normal font-sans">
                  激活后，特定外部通道收发 IMAP 流量将无感路由到下方指定的代理路径中。
                </p>
              </div>

              <button
                type="button"
                onClick={handleToggle}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  enabled ? 'bg-blue-600' : 'bg-[#1D2128]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    enabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className={`${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'} space-y-3.5 transition-opacity duration-200`}>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-4 space-y-1">
                  <label className="text-[11px] font-semibold text-[#8B949E]">代理协议</label>
                  <div className="flex bg-[#0D1117] rounded-md border border-[#30363D] p-0.5">
                    {(['HTTP', 'SOCKS5'] as ProxyType[]).map((pType) => (
                      <button
                        key={pType}
                        type="button"
                        onClick={() => setType(pType)}
                        className={`flex-1 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                          type === pType
                            ? 'bg-[#1F242C] text-white border border-[#30363D]/60 shadow-xs'
                            : 'text-[#8B949E] hover:text-[#C9D1D9]'
                        }`}
                      >
                        {pType}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-5 space-y-1">
                  <label className="text-[11px] font-semibold text-[#8B949E]">代理服务器 IP / 域名</label>
                  <div className="relative">
                    <Globe className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="e.g. 127.0.0.1"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="md:col-span-3 space-y-1">
                  <label className="text-[11px] font-semibold text-[#8B949E]">端口 Port</label>
                  <input
                    type="number"
                    placeholder="1080"
                    value={port}
                    onChange={(e) => setPort(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#8B949E]">安全认证用户名 (可选)</label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="e.g. proxy_username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-sans"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#8B949E]">安全认证登录密码 (可选)</label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      placeholder="••••••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-sans"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#30363D] mt-4">
              <button
                type="button"
                onClick={runConnectivityTest}
                disabled={connTesting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-[#30363D] bg-[#161B22] text-[#C9D1D9] hover:bg-[#21262d] transition-all disabled:opacity-50 cursor-pointer"
              >
                <Wifi className={'w-3.5 h-3.5 ' + (connTesting ? 'animate-pulse text-blue-400' : '')} />
                <span>{connTesting ? '测试中...' : '连通性测试'}</span>
              </button>

              <button
                type="submit"
                disabled={saving}
                className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                {saving ? '保存中...' : (proxyId ? '更新代理配置' : '保存新代理配置')}
              </button>
            </div>
          </form>
        </div>

        {/* 右侧：连通性测试面板 */}
        <div className="lg:col-span-4 space-y-3">
          <div className="p-4 rounded-lg border border-[#30363D] bg-[#161B22] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold text-[#8B949E] tracking-wider uppercase flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-400" />
                <span>连通性测试</span>
              </h3>
              <button
                type="button"
                onClick={runConnectivityTest}
                disabled={connTesting}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border border-[#30363D] bg-[#0D1117] text-[#C9D1D9] hover:bg-[#1F242C] disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={'w-3 h-3 ' + (connTesting ? 'animate-spin text-blue-400' : '')} />
                <span>{connTesting ? '测试中' : '测试全部'}</span>
              </button>
            </div>

            {/* 代理状态 */}
            {proxyReachable !== null && (
              <div className={'flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] ' + (proxyReachable ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400')}>
                <span className={'w-1.5 h-1.5 rounded-full ' + (proxyReachable ? 'bg-emerald-500' : 'bg-rose-500')} />
                <span>代理 {host}:{port} — {proxyReachable ? '可达' : '不可达'}</span>
              </div>
            )}

            {/* 站点列表 */}
            <div className="space-y-1">
              {[
                // 邮箱 IMAP
                { name: 'QQ邮箱 IMAP', host: 'imap.qq.com', port: 993 },
                { name: 'Gmail IMAP', host: 'imap.gmail.com', port: 993 },
                { name: 'Outlook IMAP', host: 'imap-mail.outlook.com', port: 993 },
                { name: '163邮箱 IMAP', host: 'imap.163.com', port: 993 },
                // 邮箱 SMTP
                { name: 'QQ邮箱 SMTP', host: 'smtp.qq.com', port: 465 },
                { name: 'Gmail SMTP', host: 'smtp.gmail.com', port: 465 },
              ].map((site) => {
                const result = connTestResults.find(r => r.host === site.host);
                const status = !result ? 'idle' : result.success ? 'ok' : 'fail';
                const isSiteTesting = testingSite === site.host;

                return (
                  <div key={site.host} className="flex items-center justify-between px-2.5 py-2 rounded bg-[#0D1117] border border-[#30363D]/50 hover:border-[#30363D] transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={'w-2 h-2 rounded-full shrink-0 ' + (
                        status === 'ok' ? 'bg-emerald-500' :
                        status === 'fail' ? 'bg-rose-500' :
                        'bg-slate-600'
                      )} />
                      <div className="min-w-0">
                        <div className="text-[11px] text-[#E6EDF3] font-medium">{site.name}</div>
                        <div className="text-[9px] text-slate-500 font-mono">{site.host}:{site.port}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {result && (
                        <span className={'text-[10px] font-mono ' + (result.success ? 'text-emerald-400' : 'text-rose-400')}>
                          {result.success ? result.latency + 'ms' : (result.error || '超时')}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => runSingleSiteTest(site)}
                        disabled={isSiteTesting || connTesting}
                        className="p-1 rounded text-slate-500 hover:text-[#58A6FF] hover:bg-[#1F242C] disabled:opacity-30 cursor-pointer"
                        title="测试此站点"
                      >
                        <RefreshCw className={'w-3 h-3 ' + (isSiteTesting ? 'animate-spin' : '')} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {connTestResults.length === 0 && (
              <p className="text-[10px] text-slate-500 text-center py-2">点击「测试全部」开始检测各站点连通性</p>
            )}
          </div>

          {/* 使用指南 */}
          <div className="p-4 rounded-lg border border-[#30363D] bg-[#161B22] space-y-2">
            <h3 className="text-[11px] font-bold text-[#8B949E] tracking-wider uppercase">使用指南</h3>
            <div className="space-y-1.5 text-[10px] text-slate-400">
              <p><span className="text-slate-300 font-semibold">SOCKS5</span> — 推荐，原生支持 TCP，IMAP 长连接稳定</p>
              <p><span className="text-slate-300 font-semibold">HTTP</span> — 仅支持 HTTPS，不支持 IMAP</p>
              <p className="text-blue-400">Gmail 等海外邮箱必须通过代理才能连接</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
