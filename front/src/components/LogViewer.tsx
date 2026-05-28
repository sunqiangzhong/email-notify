import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Terminal, X, Trash2, ChevronDown } from 'lucide-react';
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
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [newLogCount, setNewLogCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAtBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
      setShowScrollBtn(false);
      setNewLogCount(0);
      isAtBottomRef.current = true;
    }
  }, []);

  const checkIfAtBottom = useCallback(() => {
    if (!listRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    return scrollHeight - scrollTop - clientHeight < 50;
  }, []);

  const connectSSE = useCallback(() => {
    // 清理旧连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setConnected(false);
      return;
    }

    const sseUrl = `/api/system/logs?token=${encodeURIComponent(token)}`;

    try {
      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onopen = () => setConnected(true);

      // 初始日志（缓冲区）
      es.addEventListener('init', (event) => {
        try {
          const initialLogs: LogEntry[] = JSON.parse(event.data);
          setLogs(initialLogs);
        } catch (e) {}
      });

      // 新日志
      es.addEventListener('log', (event) => {
        try {
          const entry: LogEntry = JSON.parse(event.data);
          setLogs(prev => [entry, ...prev].slice(0, 200));
          if (!isOpen) {
            setUnread(prev => prev + 1);
          } else if (!isAtBottomRef.current) {
            // 弹窗打开但用户不在底部，显示浮动按钮
            setNewLogCount(prev => prev + 1);
            setShowScrollBtn(true);
          }
        } catch (e) {}
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        // EventSource 内置重连间隔太短，手动延迟重连
        reconnectTimer.current = setTimeout(() => connectSSE(), 5000);
      };
    } catch (e) {
      setConnected(false);
    }
  }, [isOpen]);

  useEffect(() => {
    connectSSE();
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setUnread(0);
      setShowScrollBtn(false);
      setNewLogCount(0);
      // 打开时自动滚动到底部
      setTimeout(() => {
        scrollToBottom();
      }, 150);
    }
  }, [isOpen, scrollToBottom]);

  // 监听滚动事件，判断用户是否在底部
  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom();
    isAtBottomRef.current = atBottom;
    if (atBottom) {
      setShowScrollBtn(false);
      setNewLogCount(0);
    }
  }, [checkIfAtBottom]);

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
                      {connected ? 'SSE 已连接' : '未连接'}
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
              <div
                ref={listRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-3 space-y-0.5 min-h-[300px] relative"
              >
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

                {/* 浮动「查看最新」按钮 */}
                <AnimatePresence>
                  {showScrollBtn && (
                    <motion.button
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      onClick={scrollToBottom}
                      className="sticky bottom-3 float-right flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold shadow-lg shadow-blue-600/30 transition-all cursor-pointer z-10"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>{newLogCount > 0 ? `${newLogCount} 条新日志` : '查看最新'}</span>
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* 底部 */}
              <div className="px-4 py-2 border-t border-[#30363D] bg-[#161B22] flex items-center justify-between shrink-0">
                <span className="text-[10px] text-slate-500 font-mono">
                  GET /api/system/logs (text/event-stream)
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
