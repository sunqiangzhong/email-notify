import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Terminal, X, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  type: string;
  message: string;
  data?: any;
}

const levelColors: Record<string, string> = {
  info: 'text-blue-400',
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  error: 'text-rose-400',
};

const levelBg: Record<string, string> = {
  info: 'bg-blue-500/5',
  success: 'bg-emerald-500/5',
  warning: 'bg-amber-500/5',
  error: 'bg-rose-500/5',
};

export default function LogViewer() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [unread, setUnread] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectWs = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/logs`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'init' && Array.isArray(msg.data)) {
            setLogs(msg.data);
          } else if (msg.type === 'log' && msg.data) {
            setLogs(prev => [msg.data, ...prev].slice(0, 200));
            if (!isOpen) {
              setUnread(prev => prev + 1);
            }
          }
        } catch (e) {}
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(() => connectWs(), 3000);
      };

      ws.onerror = () => ws.close();
    } catch (e) {
      setConnected(false);
    }
  }, [isOpen]);

  useEffect(() => {
    connectWs();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setUnread(0);
      setTimeout(() => {
        if (listRef.current) listRef.current.scrollTop = 0;
      }, 100);
    }
  }, [isOpen]);

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return ts; }
  };

  const modal = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60]">
          {/* 遮罩 */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsOpen(false)} />

          {/* 居中容器 */}
          <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
            {/* 弹框 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-[#0D1117] border border-[#30363D] rounded-xl w-full max-w-3xl max-h-[80vh] shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363D] bg-[#161B22] shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-md bg-[#0D1117] border border-[#30363D]">
                    <Terminal className="w-4 h-4 text-[#58A6FF]" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-[#E6EDF3] block">系统实时日志</span>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                      {connected ? 'WebSocket 已连接' : '未连接'}
                      <span className="mx-1">·</span>
                      共 {logs.length} 条
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setLogs([])}
                    className="p-1.5 rounded-md text-slate-500 hover:text-[#C9D1D9] hover:bg-[#1F242C] transition-all cursor-pointer"
                    title="清空日志"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-md text-slate-500 hover:text-[#C9D1D9] hover:bg-[#1F242C] transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 日志列表 */}
              <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-0.5 min-h-[300px]">
                {logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 py-16">
                    <Terminal className="w-8 h-8 mb-3 opacity-30" />
                    <span className="text-xs">暂无日志</span>
                    <span className="text-[10px] mt-1">系统活动将实时显示在这里</span>
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-mono flex items-start gap-2 hover:bg-[#1F242C]/50 transition-colors ${levelBg[log.level] || ''}`}
                    >
                      <span className="text-slate-500 shrink-0 w-[70px]">{formatTime(log.timestamp)}</span>
                      <span className={`shrink-0 font-bold uppercase w-[90px] ${levelColors[log.level] || 'text-slate-400'}`}>
                        [{log.type}]
                      </span>
                      <span className="text-slate-300 break-all flex-1">{log.message}</span>
                    </div>
                  ))
                )}
              </div>

              {/* 底部 */}
              <div className="px-4 py-2 border-t border-[#30363D] bg-[#161B22] flex items-center justify-between shrink-0">
                <span className="text-[10px] text-slate-500 font-mono">
                  ws://{window.location.host}/ws/logs
                </span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1 rounded-md text-xs font-medium border border-[#30363D] bg-[#0D1117] text-[#C9D1D9] hover:bg-[#1F242C] transition-all cursor-pointer"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {/* 触发按钮 */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-[#30363D] bg-[#161B22] text-[#C9D1D9] hover:bg-[#21262d] transition-all cursor-pointer"
      >
        <Terminal className={`w-3.5 h-3.5 ${connected ? 'text-emerald-400' : 'text-slate-500'}`} />
        <span>日志</span>
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center px-1 rounded-full bg-blue-600 text-white text-[9px] font-bold animate-pulse">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {createPortal(modal, document.body)}
    </>
  );
}
