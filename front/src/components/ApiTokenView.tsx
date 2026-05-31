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
  Settings,
  Save,
  RefreshCw
} from 'lucide-react';
import { systemApi } from '../services/api';

interface ApiTokenViewProps {
  triggerToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function ApiTokenView({ triggerToast }: ApiTokenViewProps) {
  const [apiToken, setApiToken] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // 加载配置
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      // 加载 API_TOKEN
      const tokenResult = await systemApi.getSetting('API_TOKEN');
      if (tokenResult.success) {
        setApiToken(tokenResult.data.value || '');
      }

      // 加载 EXTERNAL_URL（如果有）
      try {
        const urlResult = await systemApi.getSetting('EXTERNAL_URL');
        if (urlResult.success) {
          setExternalUrl(urlResult.data.value || '');
        }
      } catch (e) {
        // 忽略，可能还没有这个配置
      }
    } catch (error: any) {
      console.error('加载配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 保存 API_TOKEN
  const handleSaveToken = async () => {
    setSaving(true);
    try {
      const result = await systemApi.setSetting('API_TOKEN', apiToken);
      if (result.success) {
        triggerToast('API Token 已保存', 'success');
      } else {
        triggerToast(`保存失败: ${result.message}`, 'error');
      }
    } catch (error: any) {
      triggerToast(`保存失败: ${error.message || '服务器错误'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // 保存外部 URL
  const handleSaveUrl = async () => {
    setSaving(true);
    try {
      const result = await systemApi.setSetting('EXTERNAL_URL', externalUrl);
      if (result.success) {
        triggerToast('外部访问地址已保存', 'success');
      } else {
        triggerToast(`保存失败: ${result.message}`, 'error');
      }
    } catch (error: any) {
      triggerToast(`保存失败: ${error.message || '服务器错误'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // 生成随机令牌
  const handleGenerateToken = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    setApiToken(token);
    triggerToast('已生成新令牌，请点击保存', 'info');
  };

  // 复制到剪贴板
  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(label);
      triggerToast(`已复制: ${label}`, 'success');
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (err) {
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
    return `${base}/api${path}?token=${apiToken || 'YOUR_TOKEN'}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
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

      {/* API Token 配置 */}
      <div className="p-4 rounded-lg border border-[#30363D] bg-[#161B22] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-[#E6EDF3]">API Token</span>
          </div>
          <button
            onClick={handleGenerateToken}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#8B949E] hover:text-[#C9D1D9] border border-[#30363D] rounded hover:bg-[#21262d] transition-colors cursor-pointer"
          >
            <Key className="w-3 h-3" />
            <span>生成令牌</span>
          </button>
        </div>

        <div>
          <label className="text-xs text-[#8B949E] mb-1.5 block">
            用于外部服务访问 API 的认证令牌
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="输入或生成 API Token"
                className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] font-mono text-xs pr-10 focus:outline-none focus:border-[#58A6FF]"
              />
              <button
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-[#58A6FF] transition-colors cursor-pointer"
              >
                {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              onClick={handleSaveToken}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{saving ? '保存中...' : '保存'}</span>
            </button>
          </div>
        </div>

        {apiToken ? (
          <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              <span>API Token 已配置</span>
            </div>
          </div>
        ) : (
          <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>API Token 未配置，外部服务无法访问</span>
            </div>
          </div>
        )}

        <div className="p-2 rounded bg-[#0D1117]">
          <p className="text-[10px] text-slate-500">
            提示：令牌应该是复杂的随机字符串。点击「生成令牌」自动生成。
          </p>
        </div>
      </div>

      {/* 外部访问地址 */}
      <div className="p-4 rounded-lg border border-[#30363D] bg-[#161B22] space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-[#E6EDF3]">外部访问地址（可选）</span>
        </div>

        <div>
          <label className="text-xs text-[#8B949E] mb-1.5 block">
            如果通过 Cloudflare 隧道或其他方式访问，请填写外部 URL
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="https://your-domain.com"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              className="flex-1 px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] text-xs font-mono focus:outline-none focus:border-[#58A6FF]"
            />
            <button
              onClick={handleSaveUrl}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-[#30363D] bg-[#161B22] text-[#C9D1D9] text-xs font-semibold hover:bg-[#21262d] transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>保存</span>
            </button>
          </div>
        </div>
      </div>

      {/* API 使用示例 */}
      {apiToken && (
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
                <p className="text-[10px] text-slate-500 mb-1">请求体：</p>
                <code className="text-[10px] text-blue-300 font-mono">
                  {`{"subject": "测试", "senderName": "Test", "snippet": "消息内容"}`}
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

          {/* 认证方式说明 */}
          <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-400 font-semibold mb-2">认证方式</p>
            <ul className="text-xs text-blue-300/80 space-y-1.5">
              <li>• <strong>URL 参数：</strong><code className="bg-blue-500/20 px-1 rounded">?token=your_token</code></li>
              <li>• <strong>Header：</strong><code className="bg-blue-500/20 px-1 rounded">X-API-Token: your_token</code></li>
              <li>• 两种方式任选其一即可</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
