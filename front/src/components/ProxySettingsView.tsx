import React, { useState } from 'react';
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
  Unplug
} from 'lucide-react';
import { ProxyConfig, ProxyType } from '../types';
import { proxyApi } from '../services/api';

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

  // 连通性测试结果
  const [connTestResults, setConnTestResults] = useState<Array<{
    name: string; host: string; port: number; success: boolean; latency?: number; error?: string;
  }>>([]);
  const [proxyReachable, setProxyReachable] = useState<boolean | null>(null);
  const [connTesting, setConnTesting] = useState(false);

  const [enabled, setEnabled] = useState(proxyConfig.enabled);
  const [type, setType] = useState<ProxyType>(proxyConfig.type);
  const [host, setHost] = useState(proxyConfig.host);
  const [port, setPort] = useState(proxyConfig.port);
  const [username, setUsername] = useState(proxyConfig.username || '');
  const [password, setPassword] = useState(proxyConfig.password || '');

  // Save proxy config via API
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();

    if (enabled && (!host || !port)) {
      triggerToast('网络主机地址和端口不能为空！', 'error');
      return;
    }

    setSaving(true);
    try {
      const result = await proxyApi.create({
        name: `代理-${type}`,
        type: type.toLowerCase() as any,
        host,
        port,
        username: username || null,
        password: password || null,
      });

      if (result.success) {
        const updated: ProxyConfig = {
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
      // 启用时自动保存
      try {
        await proxyApi.create({
          name: `代理-${type}`,
          type: type.toLowerCase() as any,
          host,
          port,
          username: username || null,
          password: password || null,
        });
      } catch (e) {
        // 忽略保存错误
      }
    }

    setProxyConfig(prev => ({ ...prev, enabled: newEnabled }));
    triggerToast(`网络通道已切换为：${newEnabled ? '全局代理路由' : '本地宿主直连'}`, 'info');
  };

  // 多场景连通性测试
  const runConnectivityTest = async () => {
    if (!host || !port) {
      triggerToast('请先填写代理地址和端口', 'warning');
      return;
    }

    setConnTesting(true);
    setConnTestResults([]);
    setProxyReachable(null);
    triggerToast('正在测试各站点连通性...', 'info');

    try {
      const { proxyApi } = await import('../services/api');
      const result = await proxyApi.testConnectivity({ host, port: parseInt(String(port)), type });

      if (result.success) {
        setProxyReachable(result.data.proxy.reachable);
        setConnTestResults(result.data.targets);

        const okCount = result.data.targets.filter(t => t.success).length;
        triggerToast(
          result.data.proxy.reachable
            ? '代理可达，' + okCount + '/' + result.data.targets.length + ' 个站点连通'
            : '代理不可达，结果为直连',
          result.data.proxy.reachable ? 'success' : 'warning'
        );
      }
    } catch (error: any) {
      triggerToast('测试失败: ' + (error.message || '网络错误'), 'error');
    } finally {
      setConnTesting(false);
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
                {saving ? '保存中...' : '保存网络代理配置'}
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
                { name: 'Google', host: 'google.com', port: 443 },
                { name: 'GitHub', host: 'github.com', port: 443 },
                { name: 'YouTube', host: 'youtube.com', port: 443 },
                { name: 'Baidu', host: 'baidu.com', port: 443 },
                { name: 'QQ邮箱 IMAP', host: 'imap.qq.com', port: 993 },
                { name: 'Gmail IMAP', host: 'imap.gmail.com', port: 993 },
              ].map((site) => {
                const result = connTestResults.find(r => r.host === site.host);
                const status = !result ? 'idle' : result.success ? 'ok' : 'fail';

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
                        onClick={async () => {
                          // 单个站点测试
                          setConnTesting(true);
                          try {
                            const { proxyApi } = await import('../services/api');
                            const r = await proxyApi.testConnectivity({ host, port: parseInt(String(port)), type });
                            if (r.success) {
                              setProxyReachable(r.data.proxy.reachable);
                              // 只更新当前站点的结果
                              const siteResult = r.data.targets.find(t => t.host === site.host);
                              if (siteResult) {
                                setConnTestResults(prev => {
                                  const filtered = prev.filter(p => p.host !== site.host);
                                  return [...filtered, siteResult];
                                });
                              }
                            }
                          } catch (e) {}
                          setConnTesting(false);
                        }}
                        disabled={connTesting}
                        className="p-1 rounded text-slate-500 hover:text-[#58A6FF] hover:bg-[#1F242C] disabled:opacity-30 cursor-pointer"
                        title="测试此站点"
                      >
                        <RefreshCw className={'w-3 h-3 ' + (connTesting ? 'animate-spin' : '')} />
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
