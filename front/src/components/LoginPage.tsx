/**
 * 登录页面组件
 */
import React, { useState } from 'react';
import { Mail, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface LoginPageProps {
  onSuccess?: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register(username, password);
      }
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-600/20">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#E6EDF3] tracking-tight">MailWeNotify</h1>
          <p className="text-sm text-[#8B949E] mt-2">多邮箱聚合与微信通知管理系统</p>
        </div>

        {/* 表单卡片 */}
        <div className="bg-[#0D1117] border border-[#30363D] rounded-xl p-6 shadow-2xl">
          {/* 切换登录/注册 */}
          <div className="flex bg-[#161B22] rounded-lg p-1 mb-6">
            <button
              type="button"
              onClick={() => { setIsLogin(true); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${
                isLogin
                  ? 'bg-[#1F242C] text-[#58A6FF] shadow-sm'
                  : 'text-[#8B949E] hover:text-[#C9D1D9]'
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(false); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${
                !isLogin
                  ? 'bg-[#1F242C] text-[#58A6FF] shadow-sm'
                  : 'text-[#8B949E] hover:text-[#C9D1D9]'
              }`}
            >
              注册
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 用户名 */}
            <div>
              <label className="block text-sm font-medium text-[#C9D1D9] mb-1.5">
                用户名
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B949E]" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入用户名"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-[#0A0A0B] border border-[#30363D] rounded-lg text-[#C9D1D9] placeholder-[#484F58] focus:outline-none focus:border-[#58A6FF] focus:ring-1 focus:ring-[#58A6FF]/20 transition-all text-sm"
                />
              </div>
            </div>

            {/* 密码 */}
            <div>
              <label className="block text-sm font-medium text-[#C9D1D9] mb-1.5">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B949E]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-[#0A0A0B] border border-[#30363D] rounded-lg text-[#C9D1D9] placeholder-[#484F58] focus:outline-none focus:border-[#58A6FF] focus:ring-1 focus:ring-[#58A6FF]/20 transition-all text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B949E] hover:text-[#C9D1D9] transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isLogin ? '登录中...' : '注册中...'}</span>
                </>
              ) : (
                <span>{isLogin ? '登录' : '注册'}</span>
              )}
            </button>
          </form>

          {/* 默认账号提示 */}
          {isLogin && (
            <div className="mt-4 p-3 bg-[#161B22] border border-[#30363D] rounded-lg">
              <p className="text-xs text-[#8B949E] text-center">
                默认管理员账号: <span className="text-[#58A6FF] font-mono">admin</span> / <span className="text-[#58A6FF] font-mono">admin123</span>
              </p>
            </div>
          )}
        </div>

        {/* 底部信息 */}
        <p className="text-center text-xs text-[#484F58] mt-6">
          MailWeNotify v2.4.0 • Enterprise Edition
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
