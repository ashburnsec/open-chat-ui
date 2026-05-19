'use client';

import { useEffect, useRef } from 'react';
import type { VideoTask } from './use-chat-stream';

/**
 * M27: client-side poller for a single Veo task. The task's terminal
 * state is reached either at submit time (rare — race) or some seconds
 * to a couple of minutes later. Rather than running a server-side
 * worker we just poll the BFF every PERIOD ms while the page is open.
 *
 * Cadence: 8 s. New-api advertises 15 s internal sync but a slightly
 * faster client tick keeps the progress bar feeling alive without
 * meaningfully increasing load (one in-flight request, no concurrency).
 *
 * Lifecycle:
 *   - active task (queued / in_progress) → setInterval until terminal
 *   - terminal task (completed / failed) → no poll, no-op
 *   - first mount with already-terminal hydration (page reload after
 *     completion) → noop, the bubble already has all the data it needs
 *   - taskId change → previous interval is cleared and a fresh one
 *     starts (in practice this doesn't happen — taskIds are immutable
 *     per message — but keeps the hook safe)
 *
 * Cancellation: the cleanup arm of useEffect MUST clearInterval, else
 * the next BFF call sees the page after the user has navigated away
 * (sidebar conv switch unmounts the bubble) and we leak both an http
 * round-trip and a setMessages on a dead component.
 */
export type UseVideoTaskArgs = {
  task: VideoTask | undefined;
  /** Called when the upstream returns a new status / progress / videoUrl
   *  / errorMessage. Caller should merge the diff into its message state. */
  onUpdate: (next: VideoTask) => void;
};

const POLL_INTERVAL_MS = 8_000;
const TERMINAL: ReadonlySet<VideoTask['status']> = new Set(['completed', 'failed']);

export function useVideoTask({ task, onUpdate }: UseVideoTaskArgs): void {
  // Pin the latest onUpdate in a ref so changing identity (lambdas in
  // render) doesn't restart the interval — that would otherwise reset
  // the poll cadence on every parent render.
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const taskId = task?.taskId;
  const isActive = !!task && !TERMINAL.has(task.status);

  useEffect(() => {
    if (!taskId || !isActive) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Local terminal flag — once flipped, the finally block stops
    // scheduling further ticks even though `task.status` (closed over
    // from mount) stays 'queued'.
    let done = false;

    async function tick(): Promise<void> {
      try {
        const res = await fetch(`/api/videos/${encodeURIComponent(taskId!)}`, {
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!res.ok) {
          // Single failed poll isn't fatal — keep trying. Common cause
          // is a transient new-api hiccup; the next tick recovers.
          return;
        }
        const json = (await res.json()) as {
          status?: string;
          progress?: number;
          /** 老 chat 流 video task 格式 (TaskDto). */
          fail_reason?: string;
          /** M42-S5 PR-B follow-up: vendor patch #9 后 Vertex ConvertToOpenAIVideo
           *  失败时填 error.message — 同步读两个字段保兼容. */
          error?: { message?: string; code?: string };
          completed_at?: number;
        };
        if (cancelled) return;
        const status = (json.status as VideoTask['status']) ?? 'in_progress';
        const progress = typeof json.progress === 'number' ? json.progress : undefined;
        const next: VideoTask = {
          ...task!,
          status,
          progress,
        };
        if (status === 'completed') {
          next.videoUrl = `/api/files/videos/${encodeURIComponent(taskId!)}`;
          next.completedAt = json.completed_at
            ? json.completed_at * 1000
            : Date.now();
          next.progress = 100;
          done = true;
        } else if (status === 'failed') {
          // M42-S5 PR-B follow-up: 老 chat 流 video task 用 fail_reason,
          // OpenAI shape (storyboard 视频段) 用 error.message — 都试一遍.
          next.errorMessage =
            json.error?.message || json.fail_reason || '生成失败';
          next.completedAt = Date.now();
          done = true;
        }
        onUpdateRef.current(next);
      } catch {
        // Network blip, etc. Swallow — next tick retries.
      } finally {
        if (!cancelled && !done) {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
    }

    // Kick the first poll immediately so the user sees progress within
    // a second of the bubble landing — without this they'd stare at
    // "queued / 0%" for a full POLL_INTERVAL_MS.
    void tick();

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
    // We deliberately don't include `task` in deps — it identity-changes
    // on every onUpdate call, and the closure already captures the
    // *initial* task snapshot which is enough to build the next payload.
    // Restart only on taskId change (effectively never — taskIds are
    // immutable per assistant row) or active→terminal transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, isActive]);
}
