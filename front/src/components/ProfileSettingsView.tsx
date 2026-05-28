/**
 * 个人设置页面
 * 包含用户信息展示和密码修改功能
 */
import React, { useState } from 'react';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  Save,
  CheckCircle,
  AlertTriangle,
  KeyRound,
  Shield
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/api';

interface ProfileSettingsViewProps {
  triggerToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function ProfileSettingsView({ triggerToast }: ProfileSettingsViewProps) {
  const { user } = useAuth();

  // 密码表单状态
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong' | null>(null);

  // 计算密码强度
  const calcStrength = (pw: string) => {
    if (!pw) { setPasswordStrength(null); return; }
    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 2) setPasswordStrength('weak');
    else if (score <= 3) setPasswordStrength('medium');
    else setPasswordStrength('strong');
  };

  const handleNewPasswordChange = (val: string) => {
    setNewPassword(val);
    calcStrength(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!oldPassword) {
      triggerToast('请输入当前密码', 'error');
      return;
    }
    if (!newPassword) {
      triggerToast('请输入新密码', 'error');
      return;
    }
    if (newPassword.length < 6) {
      triggerToast('新密码长度不能少于6位', 'error');
      return;
    }
    if (newPassword === oldPassword) {
      triggerToast('新密码不能与原密码相同', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      triggerToast('两次输入的新密码不一致', 'error');
      return;
    }

    setSaving(true);
    try {
      const result = await authApi.changePassword(oldPassword, newPassword);
      if (result.success) {
        triggerToast('密码修改成功！下次登录请使用新密码', 'success');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordStrength(null);
      }
    } catch (error: any) {
      const msg = error?.message || error?.error || '密码修改失败，请重试';
      triggerToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const strengthBar = () => {
    if (!passwordStrength) return null;
    const cfg = {
      weak:   { width: 'w-1/3',  color: 'bg-rose-500',   label: '弱' },
      medium: { width: 'w-2/3',  color: 'bg-amber-500',  label: '中' },
      strong: { width: 'w-full', color: 'bg-emerald-500', label: '强' },
    }[passwordStrength];

    return (
      <div className="mt-2 space-y-1">
        <div className="h-1.5 w-full bg-[#0A0A0B] rounded-full overflow-hidden">
          <div className={`h-full ${cfg.width} ${cfg.color} rounded-full transition-all duration-300`} />
        </div>
        <span className={`text-[10px] font-mono ${
          passwordStrength === 'weak' ? 'text-rose-400' :
          passwordStrength === 'medium' ? 'text-amber-400' : 'text-emerald-400'
        }`}>
          密码强度: {cfg.label}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* 页面标题 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#161B22] border border-[#30363D] flex items-center justify-center">
          <User className="w-5 h-5 text-[#58A6FF]" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#E6EDF3] font-display">个人设置</h1>
          <p className="text-xs text-[#8B949E]">管理你的账户信息和安全设置</p>
        </div>
      </div>

      {/* 用户信息卡片 */}
      <div className="bg-[#0D1117] border border-[#30363D] rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-xs font-medium text-[#8B949E] uppercase tracking-wider">
          <Shield className="w-3.5 h-3.5 text-[#58A6FF]" />
          账户信息
        </div>

        <div className="flex items-center gap-4 p-4 bg-[#0A0A0B] border border-[#30363D] rounded-lg">
          <div
            className={`w-14 h-14 rounded-xl ${user?.avatarColor || 'bg-blue-600'} border border-black/30 flex items-center justify-center font-bold text-white text-xl shadow-lg flex-shrink-0`}
          >
            {(user?.name || user?.username || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="space-y-1 min-w-0">
            <div className="text-sm font-semibold text-[#E6EDF3] truncate">
              {user?.name || user?.username}
            </div>
            <div className="text-xs text-[#8B949E] font-mono truncate">
              {user?.email || `${user?.username}@local`}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                {user?.status === 'active' ? '正常' : user?.status}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 font-mono">
                {user?.role === 'admin' ? '管理员' : '普通用户'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#0A0A0B] border border-[#30363D] rounded-lg">
            <span className="text-[#8B949E]">用户名</span>
            <span className="text-[#E6EDF3] font-mono ml-auto">{user?.username}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-[#0A0A0B] border border-[#30363D] rounded-lg">
            <span className="text-[#8B949E]">用户 ID</span>
            <span className="text-[#E6EDF3] font-mono ml-auto truncate" title={user?.id}>
              {user?.id?.substring(0, 12)}...
            </span>
          </div>
        </div>
      </div>

      {/* 修改密码卡片 */}
      <div className="bg-[#0D1117] border border-[#30363D] rounded-xl p-5 space-y-5">
        <div className="flex items-center gap-2 text-xs font-medium text-[#8B949E] uppercase tracking-wider">
          <KeyRound className="w-3.5 h-3.5 text-amber-400" />
          修改密码
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 原密码 */}
          <div className="space-y-1.5">
            <label className="text-xs text-[#C9D1D9] font-medium flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-[#8B949E]" />
              当前密码
            </label>
            <div className="relative">
              <input
                type={showOld ? 'text' : 'password'}
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                placeholder="输入当前使用的密码"
                className="w-full px-3 py-2.5 pr-10 text-xs bg-[#0A0A0B] border border-[#30363D] rounded-lg text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#58A6FF] focus:ring-1 focus:ring-[#58A6FF]/30 transition-all"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowOld(!showOld)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8B949E] hover:text-[#C9D1D9] transition-colors cursor-pointer"
                tabIndex={-1}
              >
                {showOld ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* 新密码 */}
          <div className="space-y-1.5">
            <label className="text-xs text-[#C9D1D9] font-medium flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-emerald-400" />
              新密码
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => handleNewPasswordChange(e.target.value)}
                placeholder="输入新密码（至少6位）"
                className="w-full px-3 py-2.5 pr-10 text-xs bg-[#0A0A0B] border border-[#30363D] rounded-lg text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#58A6FF] focus:ring-1 focus:ring-[#58A6FF]/30 transition-all"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8B949E] hover:text-[#C9D1D9] transition-colors cursor-pointer"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {strengthBar()}
          </div>

          {/* 确认新密码 */}
          <div className="space-y-1.5">
            <label className="text-xs text-[#C9D1D9] font-medium flex items-center gap-1.5">
              <CheckCircle className="w-3 h-3 text-blue-400" />
              确认新密码
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="再次输入新密码"
                className="w-full px-3 py-2.5 pr-10 text-xs bg-[#0A0A0B] border border-[#30363D] rounded-lg text-[#E6EDF3] placeholder-[#484F58] focus:outline-none focus:border-[#58A6FF] focus:ring-1 focus:ring-[#58A6FF]/30 transition-all"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8B949E] hover:text-[#C9D1D9] transition-colors cursor-pointer"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <div className="flex items-center gap-1.5 text-[10px] text-rose-400 mt-1">
                <AlertTriangle className="w-3 h-3" />
                两次输入的密码不一致
              </div>
            )}
            {confirmPassword && newPassword === confirmPassword && confirmPassword.length >= 6 && (
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 mt-1">
                <CheckCircle className="w-3 h-3" />
                密码匹配
              </div>
            )}
          </div>

          {/* 提交按钮 */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-2.5 bg-[#58A6FF] hover:bg-[#4C94E5] disabled:bg-[#30363D] disabled:text-[#8B949E] text-white text-xs font-semibold rounded-lg transition-all cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
            >
              {saving ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  正在保存...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  保存新密码
                </>
              )}
            </button>
          </div>
        </form>

        {/* 安全提示 */}
        <div className="flex items-start gap-2.5 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-[11px] text-amber-300/80 space-y-1">
            <p className="font-medium text-amber-300">安全提示</p>
            <p>修改密码后，其他已登录的设备不会被自动登出。如需强制下线其他设备，请联系管理员。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
