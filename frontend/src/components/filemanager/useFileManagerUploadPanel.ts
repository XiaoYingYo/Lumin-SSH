import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createLimiter, shouldAutoOpenTransferQueue, UPLOAD_PANEL_CLOSE_ANIMATION_MS } from '../../utils/fileManagerHelpers.tsx';
import {
  getSessionUploadPanelState,
  getSessionUploadQueue,
  setSessionUploadPanelState,
  subscribeSessionUploadPanelState,
  subscribeSessionUploadQueue,
} from '../../utils/fileWorkbench.ts';
import type { TransferQueueItem } from '../../utils/fileWorkbench.ts';
import type { useFileManagerCore } from './useFileManagerCore.ts';

// 上传/传输队列面板状态：面板开合（含关闭动画）、分块上传并发限速器。
// 面板本身为独立浮动面板（由 FileManagerOverlays 固定定位渲染），
// 不再与编辑器分栏 host / workbench 状态有任何耦合。
export function useFileManagerUploadPanel(deps: ReturnType<typeof useFileManagerCore>) {
  const { sessionId, sessionGroupId, isActive } = deps;
  const setTransferInfo = useCallback((_info: unknown) => {}, []);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadFolderInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadPanelState, setUploadPanelState] = useState(() => getSessionUploadPanelState(sessionGroupId, sessionId));
  const [uploadQueueItems, setUploadQueueItems] = useState<TransferQueueItem[]>(() => getSessionUploadQueue(sessionGroupId));
  const activeUploadCount = useMemo(() => uploadQueueItems.filter((item) => item.status === 'queued' || item.status === 'uploading').length, [uploadQueueItems]);
  const uploadPanelCloseTimerRef = useRef(0);
  const [uploadPanelClosing, setUploadPanelClosing] = useState(false);

  const clearUploadPanelCloseTimer = useCallback(() => {
    if (uploadPanelCloseTimerRef.current) {
      window.clearTimeout(uploadPanelCloseTimerRef.current);
      uploadPanelCloseTimerRef.current = 0;
    }
  }, []);

  useEffect(() => () => {
    clearUploadPanelCloseTimer();
  }, [clearUploadPanelCloseTimer]);

  useEffect(() => {
    if (!sessionGroupId || !sessionId) return undefined;
    return subscribeSessionUploadPanelState(sessionGroupId, sessionId, setUploadPanelState);
  }, [sessionGroupId, sessionId]);

  useEffect(() => {
    if (!sessionGroupId) return undefined;
    return subscribeSessionUploadQueue(sessionGroupId, setUploadQueueItems);
  }, [sessionGroupId]);

  // 终端失活时自动关闭浮动面板（避免残留到其他终端）
  useEffect(() => {
    if (isActive || !sessionGroupId || !sessionId) return;
    clearUploadPanelCloseTimer();
    setUploadPanelClosing(false);
    if (uploadPanelState.uploadOpen) {
      setSessionUploadPanelState(sessionGroupId, sessionId, { uploadOpen: false });
    }
  }, [clearUploadPanelCloseTimer, isActive, sessionGroupId, sessionId, uploadPanelState.uploadOpen]);

  const openUploadPanel = useCallback(() => {
    clearUploadPanelCloseTimer();
    setUploadPanelClosing(false);
    setSessionUploadPanelState(sessionGroupId, sessionId, {
      uploadOpen: true,
    });
  }, [clearUploadPanelCloseTimer, sessionGroupId, sessionId]);

  const finishUploadPanelClose = useCallback(() => {
    clearUploadPanelCloseTimer();
    setUploadPanelClosing(false);
    setSessionUploadPanelState(sessionGroupId, sessionId, {
      uploadOpen: false,
    });
  }, [clearUploadPanelCloseTimer, sessionGroupId, sessionId]);

  const closeUploadPanel = useCallback(() => {
    const current = getSessionUploadPanelState(sessionGroupId, sessionId);
    if (!current.uploadOpen && !uploadPanelClosing) {
      return;
    }
    clearUploadPanelCloseTimer();
    setUploadPanelClosing(true);
    uploadPanelCloseTimerRef.current = window.setTimeout(() => {
      finishUploadPanelClose();
    }, UPLOAD_PANEL_CLOSE_ANIMATION_MS);
  }, [clearUploadPanelCloseTimer, finishUploadPanelClose, sessionGroupId, uploadPanelClosing]);

  const setUploadPanelOpen = useCallback((open: boolean) => {
    if (open) {
      openUploadPanel();
      return;
    }
    closeUploadPanel();
  }, [closeUploadPanel, openUploadPanel]);

  const openTransferQueueIfNeeded = useCallback(() => {
    if (shouldAutoOpenTransferQueue()) {
      setUploadPanelOpen(true);
    }
  }, [setUploadPanelOpen]);

  const transferTaskLimiterRef = useRef<{ limit: number; run: ((fn: () => unknown) => Promise<unknown>) | null }>({ limit: 0, run: null });
  const uploadChunkLimiterRef = useRef<{ limit: number; run: ((fn: () => unknown) => Promise<unknown>) | null }>({ limit: 0, run: null });

  const getTransferTaskRunner = useCallback((limit: number): (fn: () => unknown) => Promise<unknown> => {
    const normalizedLimit = Math.max(1, limit);
    const currentLimiter = transferTaskLimiterRef.current;
    if (!currentLimiter.run || currentLimiter.limit !== normalizedLimit) {
      transferTaskLimiterRef.current = {
        limit: normalizedLimit,
        run: createLimiter(normalizedLimit),
      };
    }
    return transferTaskLimiterRef.current.run as (fn: () => unknown) => Promise<unknown>;
  }, []);

  const getUploadChunkRunner = useCallback((limit: number): (fn: () => unknown) => Promise<unknown> => {
    const normalizedLimit = Math.max(1, limit);
    const currentLimiter = uploadChunkLimiterRef.current;
    if (!currentLimiter.run || currentLimiter.limit !== normalizedLimit) {
      uploadChunkLimiterRef.current = {
        limit: normalizedLimit,
        run: createLimiter(normalizedLimit),
      };
    }
    return uploadChunkLimiterRef.current.run as (fn: () => unknown) => Promise<unknown>;
  }, []);

  const toggleUploadPanel = useCallback(() => {
    if (uploadPanelClosing) {
      openUploadPanel();
      return;
    }
    const current = getSessionUploadPanelState(sessionGroupId, sessionId);
    if (current.uploadOpen) {
      closeUploadPanel();
      return;
    }
    openUploadPanel();
  }, [closeUploadPanel, openUploadPanel, sessionGroupId, sessionId, uploadPanelClosing]);

  return {
    setTransferInfo,
    isDragOver, setIsDragOver, dragCounterRef,
    uploadInputRef, uploadFolderInputRef,
    uploadPanelState, uploadQueueItems,
    activeUploadCount, uploadPanelClosing, clearUploadPanelCloseTimer,
    openUploadPanel, finishUploadPanelClose, closeUploadPanel, setUploadPanelOpen,
    openTransferQueueIfNeeded,
    transferTaskLimiterRef, uploadChunkLimiterRef,
    getTransferTaskRunner, getUploadChunkRunner, toggleUploadPanel,
  };
}