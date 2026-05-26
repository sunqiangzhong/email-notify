import React, { useState } from 'react';
import {
  MessageSquareCode, Send, Filter, Clock, Bell, BellOff,
  Key, Globe, Check, AlertCircle, Hash, X, Plus, RefreshCw
} from 'lucide-react';
import { WeChatConfig, WeChatProvider } from '../types';
import { notificationApi } from '../services/api';

interface Props {
  wechatConfig: WeChatConfig;
  setWechatConfig: React.Dispatch<React.SetStateAction<WeChatConfig>>;
  triggerToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function WeChatNotificationsView({ wechatConfig, setWechatConfig, triggerToast }: Props) {
  // 渠道类型
  const [provider, setProvider] = useState<WeChatProvider>(wechatConfig.provider);

  // 企业微信应用消息
  const [corpId, setCorpId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [corpSecret, setCorpSecret] = useState('');
  const [toUser, setToUser] = useState('@all');

  // 企业微信群机器人
  const [botKey, setBotKey] = useState('');

  // Server酱
  const [sendKey, setSendKey] = useState(wechatConfig.token || '');

  // 自定义
  const [customUrl, setCustomUrl] = useState(wechatConfig.webhookUrl || '');

  // 过滤规则
  const [enableFilter, setEnableFilter] = useState(wechatConfig.rules.enableFilter);
  const [keywords, setKeywords] = useState(wechatConfig.rules.keywords);
  const [dndEnabled, setDndEnabled] = useState(wechatConfig.rules.dndEnabled);
  const [dndStart, setDndStart] = useState(wechatConfig.rules.dndStart);
  const [dndEnd, setDndEnd] = useState(wechatConfig.rules.dndEnd);

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [savedNotificationId, setSavedNotificationId] = useState<string | null>(null);

  const keywordList = keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);

  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    const f = newKeyword.trim();
    if (keywordList.includes(f)) { triggerToast('关键词已存在', 'warning'); setNewKeyword(''); return; }
    setKeywords(keywords ? keywords + ', ' + f : f);
    setNewKeyword('');
  };

  const handleDeleteKeyword = (w: string) => {
    setKeywords(keywordList.filter(k => k !== w).join(', '));
  };

  // 构建最终 webhookUrl 和 extra
  const buildPayload = (): { webhookUrl: string; extra: any; type: string; name: string } | null => {
    switch (provider) {
      case 'wecom_app':
        if (!corpId || !agentId || !corpSecret) { triggerToast('请填写完整的应用信息', 'error'); return null; }
        return {
          webhookUrl: '',
          extra: { corpid: corpId, agentid: agentId, secret: corpSecret, touser: toUser },
          type: 'wecom',
          name: '企业微信应用消息',
        };
      case 'wecom_bot':
        if (!botKey) { triggerToast('请输入群机器人 Webhook Key', 'error'); return null; }
        return { webhookUrl: botKey, extra: {}, type: 'wecom_bot', name: '企业微信群机器人' };
      case 'server_chan':
        if (!sendKey) { triggerToast('请输入 SendKey', 'error'); return null; }
        return { webhookUrl: 'https://sctapi.ftqq.com/' + sendKey + '.send', extra: {}, type: 'serverchan', name: 'Server酱' };
      case 'custom_webhook':
        if (!customUrl) { triggerToast('请输入 Webhook URL', 'error'); return null; }
        return { webhookUrl: customUrl, extra: {}, type: 'custom', name: '自定义 Webhook' };
      default:
        return null;
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;

    setSaving(true);
    try {
      const result = await notificationApi.create({
        name: payload.name,
        type: payload.type as any,
        webhookUrl: payload.webhookUrl,
        secret: null,
        active: true,
      });

      if (result.success) {
        setSavedNotificationId(result.data.id);

        if (enableFilter && keywordList.length > 0) {
          await notificationApi.createFilter({ name: '关键词过滤', keywords: keywordList, matchType: 'any', active: true });
        }

        setWechatConfig({
          provider,
          token: sendKey,
          secret: corpSecret,
          webhookUrl: payload.webhookUrl,
          rules: { enableFilter, keywords, dndEnabled, dndStart, dndEnd },
        });

        triggerToast('推送配置已保存！', 'success');
      }
    } catch (err: any) {
      triggerToast('保存失败: ' + (err.message || '服务器错误'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!savedNotificationId) { triggerToast('请先保存配置', 'warning'); return; }
    setTesting(true);
    try {
      const r = await notificationApi.testSend(savedNotificationId);
      triggerToast(r.success ? '测试通知已送达！' : '发送失败: ' + r.message, r.success ? 'success' : 'error');
    } catch (err: any) {
      triggerToast('测试失败: ' + err.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#E6EDF3] tracking-tight font-display">微信通知配置</h1>
        <p className="text-[#8B949E] text-xs mt-0.5">配置推送渠道、关键词过滤和免打扰规则</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* 左侧：推送通道 */}
        <div className="lg:col-span-7">
          <form onSubmit={handleSave} className="p-4 rounded-lg border border-[#30363D] bg-[#161B22] space-y-4">
            <h2 className="text-xs font-semibold text-[#E6EDF3] border-l-2 border-blue-500 pl-2">1. 推送通道设置</h2>

            {/* 渠道选择 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#8B949E]">选择接入渠道</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { id: 'wecom_app', label: '企微应用' },
                  { id: 'wecom_bot', label: '企微机器人' },
                  { id: 'server_chan', label: 'Server 酱' },
                  { id: 'custom_webhook', label: '自定义' },
                ].map(p => (
                  <button key={p.id} type="button" onClick={() => setProvider(p.id as WeChatProvider)}
                    className={'py-1.5 px-1 text-[11px] font-semibold rounded border transition-all text-center cursor-pointer ' +
                      (provider === p.id
                        ? 'bg-[#1F242C] border-[#30363D] text-[#58A6FF]'
                        : 'bg-[#0D1117] border-[#30363D] text-[#8B949E] hover:text-[#C9D1D9]')}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 企业微信应用消息 */}
            {provider === 'wecom_app' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#8B949E]">Corp ID <span className="text-rose-400">*</span></label>
                    <input type="text" required placeholder="ww8abc8923e1e219ba"
                      value={corpId} onChange={e => setCorpId(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-mono" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#8B949E]">Agent ID <span className="text-rose-400">*</span></label>
                    <input type="number" required placeholder="1000002"
                      value={agentId} onChange={e => setAgentId(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-mono" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#8B949E]">Secret <span className="text-rose-400">*</span></label>
                  <input type="password" required placeholder="应用的 Secret 密钥"
                    value={corpSecret} onChange={e => setCorpSecret(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#8B949E]">接收人 (默认 @all 全员)</label>
                  <input type="text" placeholder="@all 或 userid1|userid2"
                    value={toUser} onChange={e => setToUser(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-mono" />
                </div>
                <div className="p-2.5 bg-[#0D1117] rounded-md border border-[#30363D] text-[10px] text-slate-500 space-y-1">
                  <p>1. 登录 <a href="https://work.weixin.qq.com" target="_blank" className="text-blue-400 underline">企业微信管理后台</a></p>
                  <p>2. 应用管理 → 自建 → 创建/选择应用</p>
                  <p>3. 获取 AgentId 和 Secret，企业 ID 在「我的企业」页面</p>
                </div>
              </div>
            )}

            {/* 企业微信群机器人 */}
            {provider === 'wecom_bot' && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#8B949E]">Webhook Key</label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input type="text" required placeholder="e.g. ***-xxxx-xxxx"
                    value={botKey} onChange={e => setBotKey(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-mono" />
                </div>
                <p className="text-[9px] text-slate-500">群聊 → 群机器人 → 添加机器人 → 复制 Webhook 地址中的 key</p>
              </div>
            )}

            {/* Server酱 */}
            {provider === 'server_chan' && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#8B949E]">SendKey</label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input type="text" required placeholder="SCT89237t7r9b..."
                    value={sendKey} onChange={e => setSendKey(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-mono" />
                </div>
              </div>
            )}

            {/* 自定义 */}
            {provider === 'custom_webhook' && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#8B949E]">Webhook URL</label>
                <div className="relative">
                  <Globe className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input type="url" required placeholder="https://your-domain.com/webhook"
                    value={customUrl} onChange={e => setCustomUrl(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-mono" />
                </div>
              </div>
            )}

            {/* 按钮 */}
            <div className="flex items-center justify-between pt-3 border-t border-[#30363D]">
              <button type="button" onClick={handleTest} disabled={testing || !savedNotificationId}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-[#30363D] bg-[#161B22] text-[#C9D1D9] hover:bg-[#21262d] disabled:opacity-50 cursor-pointer">
                <Send className={'w-3.5 h-3.5 ' + (testing ? 'animate-bounce text-blue-400' : '')} />
                <span>{testing ? '发送中...' : '测试推送'}</span>
              </button>
              <button type="submit" disabled={saving}
                className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50">
                {saving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </form>
        </div>

        {/* 右侧：过滤规则 */}
        <div className="lg:col-span-5">
          <div className="p-4 rounded-lg border border-[#30363D] bg-[#161B22] space-y-4">
            <h2 className="text-xs font-semibold text-[#E6EDF3] flex items-center gap-2 border-l-2 border-blue-500 pl-2">
              <Filter className="w-4 h-4 text-blue-400" />
              <span>2. 过滤规则与免打扰</span>
            </h2>

            <div className="flex items-center justify-between p-2.5 bg-[#0D1117] rounded-md border border-[#30363D]">
              <div>
                <span className="text-xs font-semibold text-[#C9D1D9] block">关键词过滤</span>
                <span className="text-[10px] text-slate-500 block">仅匹配时推送</span>
              </div>
              <button type="button" onClick={() => setEnableFilter(!enableFilter)}
                className={'relative inline-flex h-5 w-9 rounded-full cursor-pointer transition-colors ' + (enableFilter ? 'bg-blue-600' : 'bg-[#1D2128]')}>
                <span className={'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ' + (enableFilter ? 'translate-x-4 ml-0.5' : 'translate-x-0.5')} />
              </button>
            </div>

            <div className={'space-y-2 transition-opacity ' + (enableFilter ? 'opacity-100' : 'opacity-40 pointer-events-none')}>
              <form onSubmit={handleAddKeyword} className="flex gap-1.5">
                <div className="relative flex-1">
                  <Hash className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input type="text" disabled={!enableFilter} placeholder="输入关键词回车添加"
                    value={newKeyword} onChange={e => setNewKeyword(e.target.value)}
                    className="w-full pl-7 pr-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs" />
                </div>
                <button type="submit" disabled={!enableFilter}
                  className="p-1.5 rounded-md bg-blue-600 text-white disabled:opacity-40 cursor-pointer">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
              <div className="flex flex-wrap gap-1.5 p-2.5 min-h-[50px] bg-[#0D1117] rounded-md border border-[#30363D]">
                {keywordList.length === 0
                  ? <span className="text-[10px] text-slate-500 m-auto">暂无关键词</span>
                  : keywordList.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 pl-2 pr-0.5 py-0.5 rounded bg-[#161B22] border border-[#30363D] text-blue-400 text-[10px]">
                      {tag}
                      <button type="button" onClick={() => handleDeleteKeyword(tag)} className="p-0.5 text-slate-400 hover:text-rose-400 cursor-pointer">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between p-2.5 bg-[#0D1117] rounded-md border border-[#30363D]">
                <div>
                  <span className="text-xs font-semibold text-[#C9D1D9] block">免打扰 (DND)</span>
                  <span className="text-[10px] text-slate-500 block">时段内不推送</span>
                </div>
                <button type="button" onClick={() => setDndEnabled(!dndEnabled)}
                  className={'relative inline-flex h-5 w-9 rounded-full cursor-pointer transition-colors ' + (dndEnabled ? 'bg-blue-600' : 'bg-[#1D2128]')}>
                  <span className={'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ' + (dndEnabled ? 'translate-x-4 ml-0.5' : 'translate-x-0.5')} />
                </button>
              </div>
              <div className={'grid grid-cols-2 gap-2 transition-opacity ' + (dndEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none')}>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500">开始</span>
                  <input type="time" value={dndStart} onChange={e => setDndStart(e.target.value)}
                    className="w-full px-2 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] text-xs font-mono" />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500">结束</span>
                  <input type="time" value={dndEnd} onChange={e => setDndEnd(e.target.value)}
                    className="w-full px-2 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] text-xs font-mono" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
