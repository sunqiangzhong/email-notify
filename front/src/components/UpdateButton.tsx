import React, { useState, useEffect, useCallback } from 'react';
import {
  Download,
  Check,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Package,
  Clock,
  FileText,
  Shield,
  X
} from 'lucide-react';
import { updateApi, UpdateCheckResult, CurrentVersionInfo } from '../services/api';

interface UpdateButtonProps {
  triggerToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function UpdateButton({ triggerToast }: UpdateButtonProps) {
  const [versionInfo, setVersionInfo] = useState<CurrentVersionInfo | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [updateLog, setUpdateLog] = useState<Array<{ time: string; message: string }>>([]);

  // 加载当前版本信息
  useEffect(() => {
    loadCurrentVersion();
    checkForUpdates(false);
  }, []);

  const loadCurrentVersion = async () => {
    try {
      const result = await updateApi.getCurrent();
      if (result.success) {
        setVersionInfo(result.data);
      }
    } catch (error) {
      console.error('获取版本信息失败:', error);
    }
  };

  // 检查更新
  const checkForUpdates = useCallback(async (force = false) => {
    setChecking(true);
    try {
      const result = await updateApi.check(force);
      if (result.success) {
        setUpdateInfo(result.data);
      }
    } catch (error) {
      console.error('检查更新失败:', error);
    } finally {
      setChecking(false);
    }
  }, []);

  // 执行更新
  const handleUpdate = async () => {
    if (!versionInfo?.canAutoUpdate) {
      triggerToast('当前环境不支持自动更新', 'error');
      return;
    }

    setUpdating(true);
    setUpdateLog([]);

    try {
      const result = await updateApi.perform();

      if (result.success) {
        setUpdateLog(result.data.log || []);
        triggerToast('更新已执行，容器正在重启...', 'success');

        // 30秒后检查是否重启成功
        setTimeout(() => {
          window.location.reload();
        }, 30000);
      } else {
        setUpdateLog(result.data?.log || []);
        triggerToast(`更新失败: ${result.message}`, 'error');
      }
    } catch (error: any) {
      triggerToast(`更新失败: ${error.message || '未知错误'}`, 'error');
    } finally {
      setUpdating(false);
    }
  };

  // 有新版本时显示红点
  const hasUpdate = updateInfo?.hasUpdate;

  return (
    <div className="relative">
      {/* 更新按钮 */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
          hasUpdate
            ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-500/25'
            : 'border border-[#30363D] bg-[#161B22] text-[#C9D1D9] hover:bg-[#21262d]'
        }`}
      >
        {checking ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : hasUpdate ? (
          <Download className="w-3.5 h-3.5" />
        ) : (
          <Package className="w-3.5 h-3.5" />
        )}
        <span>{hasUpdate ? '有更新' : '检查更新'}</span>

        {/* 红点提示 */}
        {hasUpdate && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>

      {/* 更新面板 */}
      {showPanel && (
        <div className="absolute right-0 top-full mt-2 w-80 z-50">
          <div className="rounded-lg border border-[#30363D] bg-[#161B22] shadow-xl overflow-hidden">
            {/* 头部 */}
            <div className="flex items-center justify-between p-3 border-b border-[#30363D] bg-[#0D1117]">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-[#E6EDF3]">系统更新</span>
              </div>
              <button
                onClick={() => setShowPanel(false)}
                className="p-1 text-slate-500 hover:text-[#C9D1D9] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 内容 */}
            <div className="p-3 space-y-3">
              {/* 当前版本 */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#8B949E]">当前版本</span>
                <span className="font-mono text-[#C9D1D9]">v{versionInfo?.version || '...'}</span>
              </div>

              {/* 最新版本 */}
              {updateInfo && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#8B949E]">最新版本</span>
                  <span className={`font-mono ${hasUpdate ? 'text-blue-400' : 'text-emerald-400'}`}>
                    {updateInfo.latestVersion}
                  </span>
                </div>
              )}

              {/* 更新状态 */}
              {hasUpdate ? (
                <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-2 text-xs text-blue-400">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>发现新版本！</span>
                  </div>
                  {updateInfo?.publishedAt && (
                    <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-blue-300/60">
                      <Clock className="w-3 h-3" />
                      <span>发布于 {new Date(updateInfo.publishedAt).toLocaleDateString('zh-CN')}</span>
                    </div>
                  )}
                </div>
              ) : updateInfo ? (
                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <Check className="w-3.5 h-3.5" />
                    <span>已是最新版本</span>
                  </div>
                </div>
              ) : null}

              {/* 更新日志 */}
              {hasUpdate && updateInfo?.releaseNotes && (
                <div>
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-1.5 text-xs text-[#8B949E] hover:text-[#C9D1D9] transition-colors cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>更新日志</span>
                    {expanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>

                  {expanded && (
                    <div className="mt-2 p-2 rounded bg-[#0D1117] max-h-32 overflow-y-auto">
                      <pre className="text-[10px] text-[#8B949E] whitespace-pre-wrap">
                        {updateInfo.releaseNotes}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* 更新日志输出 */}
              {updateLog.length > 0 && (
                <div className="p-2 rounded bg-[#0D1117] max-h-40 overflow-y-auto">
                  {updateLog.map((log, index) => (
                    <div key={index} className="text-[10px] text-[#8B949E] py-0.5">
                      <span className="text-slate-600">[{new Date(log.time).toLocaleTimeString()}]</span>{' '}
                      <span>{log.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => checkForUpdates(true)}
                  disabled={checking}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-semibold border border-[#30363D] bg-[#0D1117] text-[#C9D1D9] hover:bg-[#1F242C] disabled:opacity-50 cursor-pointer transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                  <span>{checking ? '检查中...' : '重新检查'}</span>
                </button>

                {hasUpdate && (
                  <>
                    {versionInfo?.canAutoUpdate ? (
                      <button
                        onClick={handleUpdate}
                        disabled={updating}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white disabled:opacity-50 cursor-pointer transition-all"
                      >
                        {updating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>{updating ? '更新中...' : '立即更新'}</span>
                      </button>
                    ) : (
                      <a
                        href={updateInfo?.releaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>前往下载</span>
                      </a>
                    )}
                  </>
                )}
              </div>

              {/* 自动更新提示 */}
              {hasUpdate && !versionInfo?.canAutoUpdate && (
                <div className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                  <Shield className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-amber-300/80">
                    当前环境不支持自动更新，请手动下载并部署新版本。
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
