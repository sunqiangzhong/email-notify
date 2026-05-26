import React from 'react';
import { 
  Users, 
  ShieldAlert, 
  UserCheck, 
  UserX, 
  Mail, 
  Layers, 
  Compass, 
  Activity, 
  CheckCircle2, 
  AlertOctagon,
  Lock,
  Unlock
} from 'lucide-react';
import { UserProfile } from '../types';

interface MultiUserManagementViewProps {
  users: UserProfile[];
  toggleUserStatus: (userId: string) => void;
  userStats: Record<string, { accountsCount: number; logsCount: number; provider: string }>;
  triggerToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function MultiUserManagementView({
  users,
  toggleUserStatus,
  userStats,
  triggerToast
}: MultiUserManagementViewProps) {

  // Sum total aggregations
  const totalUsers = users.length;
  const suspendedUsers = users.filter(u => u.disabled).length;
  const totalActiveMailboxes = Object.values(userStats).reduce((acc, stat) => acc + stat.accountsCount, 0);

  return (
    <div className="space-y-4">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#E6EDF3] tracking-tight font-display flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            <span>系统多用户管理（Super Admin）</span>
          </h1>
          <p className="text-[#8B949E] text-xs mt-0.5">查看多租户网关全局清单。作为超级管理员，可一键挂起或锁定特定账户的后台守护接收流。</p>
        </div>

        {/* Diagnostic Aggregates Quick Cards */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-[#161B22] border border-[#30363D] rounded-md px-3 py-1 font-mono text-[10px] text-slate-400">
            用户数: <span className="text-[#58A6FF] font-semibold">{totalUsers}</span>
          </div>
          <div className="bg-[#161B22] border border-[#30363D] rounded-md px-3 py-1 font-mono text-[10px] text-slate-400">
            已被禁用数: <span className="text-rose-400 font-semibold">{suspendedUsers}</span>
          </div>
          <div className="bg-[#161B22] border border-[#30363D] rounded-md px-3 py-1 font-mono text-[10px] text-slate-400">
            全网关信道数: <span className="text-[#3FB950] font-semibold">{totalActiveMailboxes}</span>
          </div>
        </div>
      </div>

      {/* Main Container Grid */}
      <div className="grid grid-cols-1 gap-3">
        {/* User Inventory Table Card */}
        <div className="border border-[#30363D] bg-[#161B22] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#30363D] bg-[#0D1117] flex items-center justify-between">
            <span className="text-xs font-semibold text-[#C9D1D9] font-display">系统账户列表与运行阈值</span>
            <span className="text-[10px] text-slate-500 font-mono">ROOT DEPLOYED CONTAINER AGENT</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#161B22] text-[#8B949E] font-medium border-b border-[#30363D]/60 text-[11px] select-none">
                <tr>
                  <th scope="col" className="px-5 py-3">用户信息</th>
                  <th scope="col" className="px-4 py-3">系统身份</th>
                  <th scope="col" className="px-4 py-3">网关统计</th>
                  <th scope="col" className="px-4 py-3">转发通道</th>
                  <th scope="col" className="px-4 py-3">收取状态</th>
                  <th scope="col" className="px-5 py-3 text-right">安全拦截管理</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363D]/60 bg-[#0D1117]/20">
                {users.map((u) => {
                  const stat = userStats[u.id] || { accountsCount: 0, logsCount: 0, provider: '未配置' };
                  const isBlocked = u.disabled;
                  
                  return (
                    <tr key={u.id} className="hover:bg-[#161B22]/40 transition-colors">
                      {/* Name & Avatar Circle */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {/* Rich lettered graphic avatar */}
                          <div className={`w-8 h-8 rounded-full ${u.avatarColor} flex items-center justify-center font-bold text-white shadow-sm shrink-0 border border-black/40`}>
                            {u.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-[#E6EDF3] text-xs flex items-center gap-1.5">
                              {u.name}
                              {u.role === 'super_admin' && (
                                <span className="bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[9px] scale-90 px-1 py-0 rounded font-medium">
                                  SU
                                </span>
                              )}
                            </div>
                            <div className="text-[#8B949E] text-[10px] font-mono mt-0.5">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role Descriptor */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-sans">
                        <span className={`text-[10px] font-medium leading-normal px-2 py-0.5 rounded border ${
                          u.role === 'super_admin' 
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
                            : 'bg-[#1F242C] border-[#30363D] text-[#8B949E]'
                        }`}>
                          {u.role === 'super_admin' ? '超级管理员' : '系统普通租户'}
                        </span>
                      </td>

                      {/* Stat summary count (accounts / logs) */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px] text-[#C9D1D9]">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          <span>{stat.accountsCount} 邮箱</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          <span>流转发: {stat.logsCount}</span>
                        </div>
                      </td>

                      {/* Provider text badge */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-sans text-xs">
                        {stat.provider === 'server_chan' && (
                          <span className="text-[#58A6FF] bg-blue-500/10 text-[10px] px-1.5 py-0.5 rounded border border-[#30363D]">
                            Server 酱
                          </span>
                        )}
                        {stat.provider === 'work_wechat' && (
                          <span className="text-emerald-400 bg-emerald-500/10 text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/20">
                            企业微信
                          </span>
                        )}
                        {stat.provider === 'push_deer' && (
                          <span className="text-purple-400 bg-purple-500/10 text-[10px] px-1.5 py-0.5 rounded border border-purple-500/20">
                            PushDeer
                          </span>
                        )}
                        {stat.provider !== 'server_chan' && stat.provider !== 'work_wechat' && stat.provider !== 'push_deer' && (
                          <span className="text-slate-400 text-[10px] font-sans">
                            {stat.provider}
                          </span>
                        )}
                      </td>

                      {/* Collection status badge switcher */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {isBlocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-450 font-semibold text-[10px]">
                            <AlertOctagon className="w-3 h-3 text-rose-500" />
                            <span>收集已被禁用</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold text-[10px]">
                            <CheckCircle2 className="w-3 h-3 text-[#3FB950]" />
                            <span>守护常驻中</span>
                          </span>
                        )}
                      </td>

                      {/* Controls action toggle status */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right">
                        {u.role === 'super_admin' ? (
                          <span className="text-[10px] text-slate-500 select-none">管理员自身免禁</span>
                        ) : (
                          <button
                            onClick={() => {
                              toggleUserStatus(u.id);
                              triggerToast(
                                isBlocked 
                                  ? `已成功恢复 ${u.name} 的多源邮箱收取和转发机制` 
                                  : `已强制禁用分流用户 ${u.name} 的全部收信和转发守护服务`,
                                isBlocked ? 'success' : 'warning'
                              );
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                              isBlocked
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : 'bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white hover:border-transparent'
                            }`}
                          >
                            {isBlocked ? (
                              <>
                                <Unlock className="w-3 h-3" />
                                <span>一键恢复收取</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3 h-3" />
                                <span>一键禁用收取</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Informative Warning guidelines */}
        <div className="p-3 bg-[#111A2E] border border-[#1b315c] text-blue-400 rounded-md text-[11px] leading-relaxed flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
          <div className="space-y-0.5">
            <span className="font-semibold text-slate-200">隔离与行政挂钩提示：</span>
            <p className="text-slate-400 text-[10px]">
              禁用某个用户的邮箱收取功能后，即使其配置了正确的 IMAP/SMTP 和网络代理，宿主进程在监听到 incoming 邮件包时也会对其进行一键拦截，从而隔离数据传输，且该用户在切换后其顶部控制台与页面上均会呈现出高亮的管理员“已禁用/只读挂起”封锁警告信息。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
