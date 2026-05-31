import React, { useState, useEffect } from 'react';
import {
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  Settings,
  Save,
  RefreshCw,
  Shield,
  Globe
} from 'lucide-react';
import { systemApi } from '../services/api';

interface SettingsViewProps {
  triggerToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function SettingsView({ triggerToast }: SettingsViewProps) {
  const [apiToken, setApiToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  // 加载配置
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const result = await systemApi.getSetting('API_TOKEN');
      if (result.success) {
        setApiToken(result.data.value || '');
      }
    } catch (error: any) {
      console.error('加载配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 保存 API_TOKEN
  const handleSave = async () => {
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

  // 生成随机令牌
  const handleGenerate = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    setApiToken(token);
    triggerToast('已生成新令牌，请点击保存', 'info');
  };

  // 复制到剪贴板
  const handleCopy = async () => {
    if (!apiToken) return;
    try {
      await navigator.clipboard.writeText(apiToken);
      setCopied(true);
      triggerToast('已复制到剪贴板', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      triggerToast('复制失败', 'error');
    }
  };

  // 复制示例 URL
  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      triggerToast('已复制', 'success');
    } catch (err) {
      triggerToast('复制失败', 'error');
    }
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
        <h1 className="text-xl font-bold text-[#E6EDF3] tracking-tight font-display flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-400" />
          系统设置
        </h1>
        <p className="text-[#8B949E] text-xs mt-0.5">配置系统参数和外部访问</p>
      </div>

      {/* API Token 配置 */}
      <div className="p-4 rounded-lg border border-[#30363D] bg-[#161B22] space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-[#E6EDF3]">API Token</span>
        </div>

        <p className="text-xs text-[#8B949E]">
          用于外部服务访问系统的认证令牌。设置后可通过 URL 参数或 Header 方式访问 API。
        </p>

        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="输入 API Token（留空则禁用外部访问）"
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
            onClick={handleCopy}
            disabled={!apiToken}
            className="p-2 text-slate-500 hover:text-[#58A6FF] disabled:opacity-30 transition-colors cursor-pointer"
            title="复制"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#8B949E] hover:text-[#C9D1D9] border border-[#30363D] rounded hover:bg-[#21262d] transition-colors cursor-pointer"
          >
            <Key className="w-3.5 h-3.5" />
            <span>生成令牌</span>
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
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

      {/* API 使用说明 */}
      {apiToken && (
        <div className="p-4 rounded-lg border border-[#30363D] bg-[#161B22] space-y-4">
          <div className="flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-[#E6EDF3]">API 使用说明</span>
          </div>

          <div className="space-y-3">
            {/* 认证方式 */}
            <div className="p-3 rounded bg-[#0D1117] space-y-2">
              <p className="text-xs text-[#8B949E] font-medium">认证方式（二选一）：</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <code className="px-2 py-1 rounded bg-[#161B22] text-[10px] text-emerald-400 font-mono">
                    ?token=your_token
                  </code>
                  <span className="text-[10px] text-slate-500">URL 参数</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="px-2 py-1 rounded bg-[#161B22] text-[10px] text-emerald-400 font-mono">
                    X-API-Token: your_token
                  </code>
                  <span className="text-[10px] text-slate-500">Header</span>
                </div>
              </div>
            </div>

            {/* 示例 */}
            <div className="space-y-2">
              <p className="text-xs text-[#8B949E] font-medium">示例：</p>
              {[
                { label: '发送通知', method: 'POST', path: '/api/token/notify' },
                { label: '获取状态', method: 'GET', path: '/api/token/status' },
                { label: '获取邮件', method: 'GET', path: '/api/token/emails' },
              ].map((item) => (
                <div key={item.path} className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-blue-500/20 text-blue-400">
                    {item.method}
                  </span>
                  <code className="flex-1 text-[10px] text-[#C9D1D9] font-mono">
                    {window.location.origin}{item.path}?token=...
                  </code>
                  <button
                    onClick={() => handleCopyUrl(`${window.location.origin}${item.path}?token=${apiToken}`)}
                    className="p-1 text-slate-600 hover:text-[#58A6FF] transition-colors cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
