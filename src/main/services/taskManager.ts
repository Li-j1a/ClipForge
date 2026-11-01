import { EventEmitter } from 'node:events';
import path from 'node:path';
import type { ConversionTask, TaskStatus } from '../../shared/types';

export interface TaskRunHooks {
  onProgress: (percent: number, speed?: string) => void;
  /** True when another queued task already owns this output path. */
  isPathReserved: (outputPath: string) => boolean;
}

export type TaskRunner = (
  task: ConversionTask,
  hooks: TaskRunHooks,
  signal: AbortSignal,
) => Promise<{ outputPath: string; outputSize: number }>;

/**
 * Serial task queue: exactly one task runs at a time.
 * Emits 'update' for every task mutation and 'completed' for verified successes.
 */
export class TaskManager extends EventEmitter {
  private tasks: ConversionTask[] = [];
  private current: { id: string; controller: AbortController } | null = null;

  constructor(private readonly runner: TaskRunner) {
    super();
  }

  list(): ConversionTask[] {
    return this.tasks.map((t) => ({ ...t }));
  }

  add(task: ConversionTask): ConversionTask {
    if (this.tasks.some((t) => t.id === task.id)) return { ...task };
    const queued: ConversionTask = {
      ...task,
      status: 'pending',
      progress: 0,
      errorMessage: undefined,
      completedAt: undefined,
      outputSize: undefined,
    };
    this.tasks.push(queued);
    this.emitUpdate(queued);
    void this.pump();
    return { ...queued };
  }

  cancel(id: string): boolean {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return false;
    if (task.status === 'pending') {
      task.status = 'cancelled';
      task.completedAt = Date.now();
      this.emitUpdate(task);
      return true;
    }
    if (task.status === 'running') {
      task.status = 'cancelled';
      task.speed = undefined;
      task.completedAt = Date.now();
      this.emitUpdate(task);
      if (this.current?.id === id) this.current.controller.abort();
      return true;
    }
    return false;
  }

  clearFinished(): void {
    this.tasks = this.tasks.filter(
      (t) => t.status === 'pending' || t.status === 'running',
    );
  }

  isBusy(): boolean {
    return this.current !== null;
  }

  /** Abort the running job (used on app quit). */
  shutdown(): void {
    this.current?.controller.abort();
  }

  private async pump(): Promise<void> {
    if (this.current) return;
    const next = this.tasks.find((t) => t.status === 'pending');
    if (!next) return;

    const controller = new AbortController();
    this.current = { id: next.id, controller };
    next.status = 'running';
    next.progress = 0;
    next.speed = undefined;
    next.errorMessage = undefined;
    this.emitUpdate(next);

    try {
      const result = await this.runner(
        { ...next },
        {
          onProgress: (percent, speed) => {
            if (next.status !== 'running') return;
            if (Number.isFinite(percent) && percent > next.progress) {
              next.progress = Math.min(99.9, percent);
            }
            if (speed) next.speed = speed;
            this.emitUpdate(next);
          },
          isPathReserved: (outputPath) =>
            this.tasks.some(
              (other) =>
                other.id !== next.id &&
                other.status !== 'cancelled' &&
                path.resolve(other.outputPath).toLowerCase() === path.resolve(outputPath).toLowerCase(),
            ),
        },
        controller.signal,
      );

      if ((next.status as TaskStatus) === 'cancelled' || controller.signal.aborted) {
        // late success after cancel: do not resurrect the task
        this.emitUpdate(next);
      } else {
        next.outputPath = result.outputPath;
        next.outputSize = result.outputSize;
        next.progress = 100;
        next.speed = undefined;
        next.status = 'completed';
        next.completedAt = Date.now();
        this.emitUpdate(next);
        this.emit('completed', { ...next });
      }
    } catch (err) {
      if (controller.signal.aborted || (err as Error)?.name === 'ConversionCancelledError') {
        next.status = 'cancelled';
      } else if ((next.status as TaskStatus) !== 'cancelled') {
        next.status = 'failed';
        next.errorMessage = (err as Error)?.message || '未知错误';
      }
      next.speed = undefined;
      next.completedAt = Date.now();
      this.emitUpdate(next);
    } finally {
      this.current = null;
      void this.pump();
    }
  }

  private emitUpdate(task: ConversionTask): void {
    this.emit('update', { ...task });
  }
}
