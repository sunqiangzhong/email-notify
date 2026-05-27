import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquareCode, Send, Filter, Bell, BellOff,
  Key, Globe, Check, AlertCircle, X, Plus, RefreshCw,
  Settings, Trash2, Edit3, ChevronDown, ChevronUp,
  Slack, Send as Telegram, Webhook
} from 'lucide-react';
import { notificationApi, NotificationData, FilterData } from '../services/api';

// 通知渠道类型定义
interface NotificationType {
  name: string;
  description: string;
  fields: Array<{
    key: string;
    label: string;
    required: boolean;
    hint: string;
    default?: string;
  }>;
}

interface Props {
  triggerToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function WeChatNotificationsView({ triggerToast }: Props) {
  // 通知渠道列表
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  // 通知类型配置
  const [notificationTypes, setNotificationTypes] = useState<Record<string, NotificationType>>({});
  // 过滤规则列表
  const [filters, setFilters] = useState<FilterData[]>([]);
  // 当前编辑的通知
  const [editingNotification, setEditingNotification] = useState<Partial<NotificationData> | null>(null);
  // 当前编辑的过滤规则
  const [editingFilter, setEditingFilter] = useState<Partial<FilterData> | null>(null);
  // 加载状态
  const [loading, setLoading] = useState(true);
  // 测试状态
  const [testingId, setTestingId] = useState<string | null>(null);
  // 展开的通知 ID
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [typesRes, notifsRes, filtersRes] = await Promise.allSettled([
        notificationApi.getTypes(),
        notificationApi.getAll(),
        notificationApi.getAllFilters(),
      ]);

      if (typesRes.status === 'fulfilled' && typesRes.value.success) {
        setNotificationTypes(typesRes.value.data);
      }

      if (notifsRes.status === 'fulfilled' && notifsRes.value.success) {
        setNotifications(notifsRes.value.data);
      }

      if (filtersRes.status === 'fulfilled' && filtersRes.value.success) {
        setFilters(filtersRes.value.data);
      }
    } catch (error) {
      console.error('加载通知配置失败:', error);
      triggerToast('加载通知配置失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [triggerToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 创建新通知渠道
  const handleCreateNotification = (type: string) => {
    const typeConfig = notificationTypes[type];
    if (!typeConfig) return;

    // 初始化默认配置
    const defaultConfig: Record<string, string> = {};
    typeConfig.fields.forEach(field => {
      if (field.default) {
        defaultConfig[field.key] = field.default;
      }
    });

    setEditingNotification({
      name: typeConfig.name,
      type: type as NotificationData['type'],
      config: defaultConfig,
      active: true,
    });
  };

  // 保存通知渠道
  const handleSaveNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNotification) return;

    try {
      let result;
      if (editingNotification.id) {
        result = await notificationApi.update(editingNotification.id, editingNotification);
      } else {
        result = await notificationApi.create(editingNotification);
      }

      if (result.success) {
        triggerToast('通知渠道保存成功', 'success');
        setEditingNotification(null);
        loadData();
      }
    } catch (error: any) {
      triggerToast('保存失败: ' + (error.message || '服务器错误'), 'error');
    }
  };

  // 删除通知渠道
  const handleDeleteNotification = async (id: string) => {
    if (!confirm('确定要删除这个通知渠道吗？')) return;

    try {
      const result = await notificationApi.delete(id);
      if (result.success) {
        triggerToast('通知渠道已删除', 'success');
        loadData();
      }
    } catch (error: any) {
      triggerToast('删除失败: ' + (error.message || '服务器错误'), 'error');
    }
  };

  // 测试通知
  const handleTestNotification = async (id: string) => {
    setTestingId(id);
    try {
      const result = await notificationApi.testSend(id);
      triggerToast(result.success ? '测试通知已送达！' : '发送失败: ' + result.message, result.success ? 'success' : 'error');
    } catch (error: any) {
      triggerToast('测试失败: ' + error.message, 'error');
    } finally {
      setTestingId(null);
    }
  };

  // 创建过滤规则
  const handleCreateFilter = () => {
    setEditingFilter({
      name: '',
      keywords: [],
      matchType: 'any',
      active: true,
    });
  };

  // 保存过滤规则
  const handleSaveFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFilter) return;

    try {
      let result;
      if (editingFilter.id) {
        result = await notificationApi.updateFilter(editingFilter.id, editingFilter);
      } else {
        result = await notificationApi.createFilter(editingFilter);
      }

      if (result.success) {
        triggerToast('过滤规则保存成功', 'success');
        setEditingFilter(null);
        loadData();
      }
    } catch (error: any) {
      triggerToast('保存失败: ' + (error.message || '服务器错误'), 'error');
    }
  };

  // 删除过滤规则
  const handleDeleteFilter = async (id: string) => {
    if (!confirm('确定要删除这个过滤规则吗？')) return;

    try {
      const result = await notificationApi.deleteFilter(id);
      if (result.success) {
        triggerToast('过滤规则已删除', 'success');
        loadData();
      }
    } catch (error: any) {
      triggerToast('删除失败: ' + (error.message || '服务器错误'), 'error');
    }
  };

  // 获取渠道图标
  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'wecom_app':
      case 'wecom_webhook':
        return <MessageSquareCode className="w-4 h-4 text-green-500" />;
      case 'server_chan':
        return <Bell className="w-4 h-4 text-orange-500" />;
      case 'telegram':
        return <Send className="w-4 h-4 text-blue-500" />;
      case 'dingtalk':
        return <MessageSquareCode className="w-4 h-4 text-blue-600" />;
      case 'feishu':
        return <MessageSquareCode className="w-4 h-4 text-blue-400" />;
      case 'custom_webhook':
        return <Webhook className="w-4 h-4 text-purple-500" />;
      default:
        return <Bell className="w-4 h-4 text-slate-400" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#8B949E]">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span>正在加载通知配置...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 页面标题 */}
      <div>
        <h1 className="text-xl font-bold text-[#E6EDF3] tracking-tight font-display">通知配置</h1>
        <p className="text-[#8B949E] text-xs mt-0.5">配置多种通知渠道，接收邮件推送提醒</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 左侧：通知渠道列表 */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-[#E6EDF3] flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-400" />
              <span>通知渠道</span>
            </h2>
            <button
              onClick={() => setEditingNotification({ type: 'wecom_app', config: {}, active: true })}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>添加渠道</span>
            </button>
          </div>

          {/* 渠道列表 */}
          {notifications.length === 0 ? (
            <div className="p-8 rounded-lg border border-[#30363D] bg-[#161B22] text-center">
              <BellOff className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-[#8B949E]">暂未配置通知渠道</p>
              <p className="text-xs text-slate-500 mt-1">点击上方按钮添加通知渠道</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map(notif => (
                <div
                  key={notif.id}
                  className="rounded-lg border border-[#30363D] bg-[#161B22] overflow-hidden"
                >
                  {/* 渠道头部 */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#1F242C]/50 transition-colors"
                    onClick={() => setExpandedId(expandedId === notif.id ? null : notif.id)}
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#0D1117] border border-[#30363D] flex items-center justify-center">
                      {getChannelIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#E6EDF3]">{notif.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                          notif.active
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-500/10 text-slate-400 border border-slate-500/30'
                        }`}>
                          {notif.active ? '已启用' : '已禁用'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {notificationTypes[notif.type]?.name || notif.type}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTestNotification(notif.id);
                        }}
                        disabled={testingId === notif.id}
                        className="p-1.5 rounded hover:bg-[#21262d] text-[#8B949E] hover:text-[#C9D1D9] cursor-pointer disabled:opacity-50"
                        title="测试发送"
                      >
                        <Send className={`w-3.5 h-3.5 ${testingId === notif.id ? 'animate-bounce text-blue-400' : ''}`} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingNotification(notif);
                        }}
                        className="p-1.5 rounded hover:bg-[#21262d] text-[#8B949E] hover:text-[#C9D1D9] cursor-pointer"
                        title="编辑"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNotification(notif.id);
                        }}
                        className="p-1.5 rounded hover:bg-[#21262d] text-[#8B949E] hover:text-rose-400 cursor-pointer"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {expandedId === notif.id ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </div>
                  </div>

                  {/* 展开的详情 */}
                  {expandedId === notif.id && (
                    <div className="px-4 py-3 border-t border-[#30363D] bg-[#0D1117] text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(notif.config || {}).map(([key, value]) => (
                          value ? (
                            <div key={key} className="flex items-start gap-2">
                              <span className="text-slate-500 shrink-0">{key}:</span>
                              <span className="text-[#C9D1D9] font-mono break-all">
                                {key.toLowerCase().includes('secret') || key.toLowerCase().includes('token') || key.toLowerCase().includes('key')
                                  ? '••••••'
                                  : String(value)
                                }
                              </span>
                            </div>
                          ) : null
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 添加渠道选择 */}
          {!editingNotification && (
            <div className="p-3 rounded-lg border border-dashed border-[#30363D] bg-[#161B22]/50">
              <p className="text-[10px] text-slate-500 mb-2">快速添加:</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(notificationTypes).map(([type, config]) => (
                  <button
                    key={type}
                    onClick={() => handleCreateNotification(type)}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-[#0D1117] border border-[#30363D] text-[10px] text-[#8B949E] hover:text-[#C9D1D9] hover:border-[#58A6FF]/50 cursor-pointer transition-colors"
                  >
                    {getChannelIcon(type)}
                    <span>{config.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 编辑表单 */}
          {editingNotification && (
            <form onSubmit={handleSaveNotification} className="p-4 rounded-lg border border-[#58A6FF]/30 bg-[#161B22] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#E6EDF3]">
                  {editingNotification.id ? '编辑通知渠道' : '添加通知渠道'}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingNotification(null)}
                  className="p-1 rounded hover:bg-[#21262d] text-[#8B949E] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 渠道类型选择 */}
              {!editingNotification.id && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-[#8B949E]">通知渠道类型</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {Object.entries(notificationTypes).map(([type, config]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          const defaultConfig: Record<string, string> = {};
                          config.fields.forEach(field => {
                            if (field.default) defaultConfig[field.key] = field.default;
                          });
                          setEditingNotification({
                            ...editingNotification,
                            type: type as NotificationData['type'],
                            name: config.name,
                            config: defaultConfig,
                          });
                        }}
                        className={`py-1.5 px-2 text-[11px] font-semibold rounded border transition-all text-center cursor-pointer ${
                          editingNotification.type === type
                            ? 'bg-[#1F242C] border-[#58A6FF] text-[#58A6FF]'
                            : 'bg-[#0D1117] border-[#30363D] text-[#8B949E] hover:text-[#C9D1D9]'
                        }`}
                      >
                        {config.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 名称 */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#8B949E]">渠道名称</label>
                <input
                  type="text"
                  required
                  value={editingNotification.name || ''}
                  onChange={e => setEditingNotification({ ...editingNotification, name: e.target.value })}
                  className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs"
                  placeholder="给这个渠道起个名字"
                />
              </div>

              {/* 动态配置项 */}
              {editingNotification.type && notificationTypes[editingNotification.type]?.fields.map(field => (
                <div key={field.key} className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#8B949E]">
                    {field.label}
                    {field.required && <span className="text-rose-400 ml-0.5">*</span>}
                  </label>
                  <input
                    type={field.key.toLowerCase().includes('secret') || field.key.toLowerCase().includes('token') || field.key.toLowerCase().includes('key') || field.key.toLowerCase().includes('password') ? 'password' : 'text'}
                    required={field.required}
                    value={editingNotification.config?.[field.key as keyof typeof editingNotification.config] || ''}
                    onChange={e => setEditingNotification({
                      ...editingNotification,
                      config: { ...editingNotification.config, [field.key]: e.target.value },
                    })}
                    className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs font-mono"
                    placeholder={field.hint}
                  />
                  {field.hint && (
                    <p className="text-[9px] text-slate-500">{field.hint}</p>
                  )}
                </div>
              ))}

              {/* 启用状态 */}
              <div className="flex items-center justify-between p-2.5 bg-[#0D1117] rounded-md border border-[#30363D]">
                <div>
                  <span className="text-xs font-semibold text-[#C9D1D9] block">启用通知</span>
                  <span className="text-[10px] text-slate-500 block">开启后将通过此渠道发送通知</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingNotification({
                    ...editingNotification,
                    active: !editingNotification.active,
                  })}
                  className={`relative inline-flex h-5 w-9 rounded-full cursor-pointer transition-colors ${
                    editingNotification.active ? 'bg-blue-600' : 'bg-[#1D2128]'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${
                    editingNotification.active ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {/* 按钮 */}
              <div className="flex justify-end gap-2 pt-2 border-t border-[#30363D]">
                <button
                  type="button"
                  onClick={() => setEditingNotification(null)}
                  className="px-3 py-1.5 rounded-md border border-[#30363D] text-[#C9D1D9] text-xs font-semibold hover:bg-[#21262d] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
                >
                  保存
                </button>
              </div>
            </form>
          )}
        </div>

        {/* 右侧：过滤规则 */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-[#E6EDF3] flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-400" />
              <span>过滤规则</span>
            </h2>
            <button
              onClick={handleCreateFilter}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#161B22] border border-[#30363D] text-[#C9D1D9] text-[11px] font-semibold hover:bg-[#21262d] cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>添加规则</span>
            </button>
          </div>

          {/* 规则列表 */}
          {filters.length === 0 ? (
            <div className="p-6 rounded-lg border border-[#30363D] bg-[#161B22] text-center">
              <Filter className="w-6 h-6 text-slate-500 mx-auto mb-2" />
              <p className="text-xs text-[#8B949E]">暂无过滤规则</p>
              <p className="text-[10px] text-slate-500 mt-1">添加规则可以过滤特定邮件</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filters.map(filter => (
                <div
                  key={filter.id}
                  className="p-3 rounded-lg border border-[#30363D] bg-[#161B22]"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#E6EDF3]">{filter.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                          filter.active
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-500/10 text-slate-400 border border-slate-500/30'
                        }`}>
                          {filter.active ? '已启用' : '已禁用'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        匹配模式: {filter.matchType === 'all' ? '全部匹配' : '任一匹配'}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {filter.keywords.map(keyword => (
                          <span key={keyword} className="px-1.5 py-0.5 rounded bg-[#0D1117] border border-[#30363D] text-[10px] text-blue-400">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingFilter(filter)}
                        className="p-1 rounded hover:bg-[#21262d] text-[#8B949E] hover:text-[#C9D1D9] cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteFilter(filter.id)}
                        className="p-1 rounded hover:bg-[#21262d] text-[#8B949E] hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 编辑过滤规则 */}
          {editingFilter && (
            <form onSubmit={handleSaveFilter} className="p-4 rounded-lg border border-[#58A6FF]/30 bg-[#161B22] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#E6EDF3]">
                  {editingFilter.id ? '编辑过滤规则' : '添加过滤规则'}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingFilter(null)}
                  className="p-1 rounded hover:bg-[#21262d] text-[#8B949E] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#8B949E]">规则名称</label>
                <input
                  type="text"
                  required
                  value={editingFilter.name || ''}
                  onChange={e => setEditingFilter({ ...editingFilter, name: e.target.value })}
                  className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs"
                  placeholder="给规则起个名字"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#8B949E]">关键词（每行一个）</label>
                <textarea
                  value={(editingFilter.keywords || []).join('\n')}
                  onChange={e => setEditingFilter({
                    ...editingFilter,
                    keywords: e.target.value.split('\n').filter(k => k.trim()),
                  })}
                  className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#30363D] rounded-md text-[#C9D1D9] focus:outline-none focus:border-[#58A6FF] text-xs h-20 resize-none"
                  placeholder="输入关键词，每行一个"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#8B949E]">匹配模式</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingFilter({ ...editingFilter, matchType: 'any' })}
                    className={`flex-1 py-1.5 rounded text-[11px] font-semibold border cursor-pointer ${
                      editingFilter.matchType === 'any'
                        ? 'bg-[#1F242C] border-[#58A6FF] text-[#58A6FF]'
                        : 'bg-[#0D1117] border-[#30363D] text-[#8B949E]'
                    }`}
                  >
                    任一匹配
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingFilter({ ...editingFilter, matchType: 'all' })}
                    className={`flex-1 py-1.5 rounded text-[11px] font-semibold border cursor-pointer ${
                      editingFilter.matchType === 'all'
                        ? 'bg-[#1F242C] border-[#58A6FF] text-[#58A6FF]'
                        : 'bg-[#0D1117] border-[#30363D] text-[#8B949E]'
                    }`}
                  >
                    全部匹配
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[#0D1117] rounded-md border border-[#30363D]">
                <span className="text-xs text-[#C9D1D9]">启用规则</span>
                <button
                  type="button"
                  onClick={() => setEditingFilter({ ...editingFilter, active: !editingFilter.active })}
                  className={`relative inline-flex h-5 w-9 rounded-full cursor-pointer transition-colors ${
                    editingFilter.active ? 'bg-blue-600' : 'bg-[#1D2128]'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${
                    editingFilter.active ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#30363D]">
                <button
                  type="button"
                  onClick={() => setEditingFilter(null)}
                  className="px-3 py-1.5 rounded-md border border-[#30363D] text-[#C9D1D9] text-xs font-semibold hover:bg-[#21262d] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
                >
                  保存
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
