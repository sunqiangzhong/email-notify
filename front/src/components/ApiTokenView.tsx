import React, { useState, useEffect } from 'react';
import {
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  Shield,
  Globe,
  Lock,
  AlertCircle,
  Settings
} from 'lucide-react';
import { tokenApi } from '../services/api';

interface ApiTokenViewProps {
  triggerToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function ApiTokenView({ triggerToast }: ApiTokenViewProps) {
  const [token, setToken] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [externalUrl, setExternalUrl] = useState('');

  // 加载令牌信息
  useEffect(() => {
    loadToken();
  }, []);

  const loadToken = async () => {
    setLoading(true);
    try {
      const result = await tokenApi.get();
      if (result.success) {
        setToken(result.data.token);
        setHasToken(result.data.hasToken);
      }
    } catch (error: any) {
      console.error('加载令牌失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 复制到剪贴板
  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(label);
      triggerToast(`已复制: ${label}`, 'success');
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (err) {
      // fallback
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedUrl(label);
      triggerToast(`已复制: ${label}`, 'success');
      setTimeout(() => setCopiedUrl(null), 2000);
    }
  };

  // 生成示例 URL
  const getExampleUrl = (path: string) => {
    const base = externalUrl || window.location.origin;
    return `${base}/api${path}?token=${token || 'YOUR_TOKEN'}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        <span className="ml-2 text-sm text-[#8B949E]">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h2 className="text-lg font-bold text-[#E6EDF3] flex items-center gap-2">
          <Key className="w-5 h-5 text-blue-400" />
          API 令牌设置
        </h2>
        <p className="text-sm text-[#8B949E] mt-1">
          配置 API 令牌以允许外部服务访问系统接口
        </p>
      </div>

      {/* 配置说明 */}
      <div className="p-4 rounded-lg border border-[#30363D] bg-[#161B22] space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-[#E6EDF3]">配置方法</span>
        </div>

        <div className="space-y-3">
          <div className="p-3 rounded bg-[#0D1117] border border-[#30363D]">
            <p className="text-xs text-[#8B949E] mb-2">在环境变量或 docker-compose.yml 中添加：</p>
            <code className="block p-2 rounded bg-[#161B22] text-xs text-emerald-400 font-mono">
              API_TOKEN=your_secret_token_here
            </code>
          </div>

          <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-300/80 space-y-1">
                <p>• 修改环境变量后需要重启服务才能生效</p>
                <p>• 令牌应该是复杂的随机字符串，避免被猜测</p>
                <p>• 可以使用命令生成：<code className="bg-amber-500/20 px-1 rounded">openssl rand -hex 32</code></p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 当前令牌状态 */}
      <div className="p-4 rounded-lg border border-[#30363D] bg-[#161B22] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-[#E6EDF3]">当前令牌状态</span>
          </div>
          <button
            onClick={loadToken}
            className="px-2 py-1 text-xs text-[#8B949E] hover:text-[#C9D1D9] transition-colors cursor-pointer"
          >
            刷新
          </button>
        </div>

        {!hasToken ? (
          <div className="text-center py-6">
            <Lock className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-[#8B949E]">API 令牌未配置</p>
            <p className="text-xs text-slate-500 mt-1">请在环境变量中设置 API_TOKEN</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 令牌显示 */}
            <div>
              <label className="text-xs text-[#8B949E] mb-1.5 block">当前令牌</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={token || ''}
                    readOnly
                    className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] font-mono text-xs pr-20"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      onClick={() => setShowToken(!showToken)}
                      className="p-1.5 text-slate-500 hover:text-[#58A6FF] transition-colors cursor-pointer"
                      title={showToken ? '隐藏' : '显示'}
                    >
                      {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => handleCopy(token || '', '令牌')}
                      className="p-1.5 text-slate-500 hover:text-[#58A6FF] transition-colors cursor-pointer"
                      title="复制"
                    >
                      {copiedUrl === '令牌' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>API 令牌已配置，可以正常访问</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 外部访问地址设置 */}
      <div className="p-4 rounded-lg border border-[#30363D] bg-[#161B22] space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-[#E6EDF3]">外部访问地址（可选）</span>
        </div>

        <div>
          <label className="text-xs text-[#8B949E] mb-1.5 block">
            如果通过 Cloudflare 隧道或其他方式访问，请填写外部 URL
          </label>
          <input
            type="text"
            placeholder="https://your-domain.com"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] text-xs font-mono focus:outline-none focus:border-[#58A6FF]"
          />
        </div>
      </div>

      {/* API 使用示例 */}
      {hasToken && (
        <div className="p-4 rounded-lg border border-[#30363D] bg-[#161B22] space-y-4">
          <h3 className="text-sm font-semibold text-[#E6EDF3] flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-blue-400" />
            API 使用示例
          </h3>

          <div className="space-y-4">
            {/* 发送通知 */}
            <div>
              <p className="text-xs text-[#8B949E] mb-2 font-medium">发送通知（POST）</p>
              <div className="flex items-start gap-2">
                <code className="flex-1 p-3 rounded bg-[#0D1117] text-xs text-emerald-400 font-mono break-all">
                  {getExampleUrl('/token/notify')}
                </code>
                <button
                  onClick={() => handleCopy(getExampleUrl('/token/notify'), '发送通知 URL')}
                  className="p-2 text-slate-500 hover:text-[#58A6FF] transition-colors cursor-pointer shrink-0"
                >
                  {copiedUrl === '发送通知 URL' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <div className="mt-2 p-2 rounded bg-[#0D1117]">
                <p className="text-[10px] text-slate-500 mb-1">请求体示例：</p>
                <code className="text-[10px] text-blue-300 font-mono">
                  {`{"subject": "测试通知", "senderName": "Test", "snippet": "消息内容"}`}
                </code>
              </div>
            </div>

            {/* 获取状态 */}
            <div>
              <p className="text-xs text-[#8B949E] mb-2 font-medium">获取系统状态（GET）</p>
              <div className="flex items-start gap-2">
                <code className="flex-1 p-3 rounded bg-[#0D1117] text-xs text-emerald-400 font-mono break-all">
                  {getExampleUrl('/token/status')}
                </code>
                <button
                  onClick={() => handleCopy(getExampleUrl('/token/status'), '获取状态 URL')}
                  className="p-2 text-slate-500 hover:text-[#58A6FF] transition-colors cursor-pointer shrink-0"
                >
                  {copiedUrl === '获取状态 URL' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* 获取邮件 */}
            <div>
              <p className="text-xs text-[#8B949E] mb-2 font-medium">获取最近邮件（GET）</p>
              <div className="flex items-start gap-2">
                <code className="flex-1 p-3 rounded bg-[#0D1117] text-xs text-emerald-400 font-mono break-all">
                  {getExampleUrl('/token/emails')}
                </code>
                <button
                  onClick={() => handleCopy(getExampleUrl('/token/emails'), '获取邮件 URL')}
                  className="p-2 text-slate-500 hover:text-[#58A6FF] transition-colors cursor-pointer shrink-0"
                >
                  {copiedUrl === '获取邮件 URL' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                可选参数: <code className="bg-[#0D1117] px-1 rounded">page</code>, <code className="bg-[#0D1117] px-1 rounded">pageSize</code>
              </p>
            </div>
          </div>

          {/* 使用说明 */}
          <div className="mt-4 p-3 rounded bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-400 font-semibold mb-2">认证方式</p>
            <ul className="text-xs text-blue-300/80 space-y-1.5">
              <li>• <strong>URL 参数：</strong><code className="bg-blue-500/20 px-1 rounded">?token=your_token</code></li>
              <li>• <strong>Header：</strong><code className="bg-blue-500/20 px-1 rounded">X-API-Token: your_token</code></li>
              <li>• 两种方式任选其一即可</li>
            </ul>
          </div>

          {/* 企业微信回调示例 */}
          <div className="p-3 rounded bg-purple-500/10 border border-purple-500/20">
            <p className="text-xs text-purple-400 font-semibold mb-2">企业微信回调配置</p>
            <p className="text-xs text-purple-300/80 mb-2">
              在企业微信应用的「接收消息」配置中，设置 API 接收地址为：
            </p>
            <code className="block p-2 rounded bg-[#0D1117] text-[10px] text-purple-300 font-mono break-all">
              {getExampleUrl('/token/notify')}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
