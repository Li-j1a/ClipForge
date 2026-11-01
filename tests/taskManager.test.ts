import { describe, expect, it } from 'vitest';
import type { ConversionTask } from '../src/shared/types';
import { TaskManager, type TaskRunner } from '../src/main/services/taskManager';

function makeTask(id: string, overrides: Partial<ConversionTask> = {}): ConversionTask {
  return {
    id,
    inputPath: `C:\\in\\${id}.mp4`,
    inputName: `${id}.mp4`,
    inputSize: 1000,
    inputFormat: 'MP4',
    outputPath: `C:\\out\\${id}.mp4`,
    outputFormat: 'mp4',
    preset: 'compatibility',
    status: 'pending',
    progress: 0,
    duration: 10,
    createdAt: Date.now(),
    ...overrides,
  };
}

function flush(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('TaskManager queue', () => {
  it('runs tasks strictly one at a time in insertion order', async () => {
    const started: string[] = [];
    const gates: Array<ReturnType<typeof deferred<{ outputPath: string; outputSize: number }>>> = [];

    const runner: TaskRunner = async (task) => {
      started.push(task.id);
      const gate = deferred<{ outputPath: string; outputSize: number }>();
      gates.push(gate);
      return gate.promise;
    };

    const tm = new TaskManager(runner);
    tm.add(makeTask('a'));
    tm.add(makeTask('b'));
    await flush();
    expect(started).toEqual(['a']);

    gates[0].resolve({ outputPath: 'C:\\out\\a.mp4', outputSize: 500 });
    await flush();
    expect(started).toEqual(['a', 'b']);
    expect(tm.list().find((t) => t.id === 'a')?.status).toBe('completed');

    gates[1].resolve({ outputPath: 'C:\\out\\b.mp4', outputSize: 600 });
    await flush();
    const tasks = tm.list();
    expect(tasks.map((t) => t.status)).toEqual(['completed', 'completed']);
    expect(tasks[1].progress).toBe(100);
    expect(tasks[1].outputSize).toBe(600);
  });

  it('emits update events and a completed event', async () => {
    const updates: string[] = [];
    let completedId = '';
    const tm = new TaskManager(async (task) => ({
      outputPath: task.outputPath,
      outputSize: 42,
    }));
    tm.on('update', (t: ConversionTask) => updates.push(`${t.id}:${t.status}`));
    tm.on('completed', (t: ConversionTask) => {
      completedId = t.id;
    });

    tm.add(makeTask('a'));
    await flush();
    expect(updates).toContain('a:pending');
    expect(updates).toContain('a:running');
    expect(updates).toContain('a:completed');
    expect(completedId).toBe('a');
  });

  it('propagates progress but never fakes 100% early', async () => {
    const gate = deferred<{ outputPath: string; outputSize: number }>();
    const tm = new TaskManager(async (_task, hooks) => {
      hooks.onProgress(42.5, '2.1x');
      hooks.onProgress(99.95, '3.0x');
      return gate.promise;
    });
    tm.add(makeTask('a'));
    await flush();
    const task = tm.list()[0];
    expect(task.status).toBe('running');
    expect(task.progress).toBe(99.9);
    expect(task.speed).toBe('3.0x');
    gate.reject(new Error('test cleanup'));
    await flush();
  });

  it('cancels a pending task without ever running it', async () => {
    const started: string[] = [];
    const gate = deferred<{ outputPath: string; outputSize: number }>();
    const tm = new TaskManager(async (task) => {
      started.push(task.id);
      return gate.promise;
    });
    tm.add(makeTask('a'));
    tm.add(makeTask('b'));
    await flush();

    expect(tm.cancel('b')).toBe(true);
    expect(tm.list().find((t) => t.id === 'b')?.status).toBe('cancelled');

    gate.resolve({ outputPath: 'C:\\out\\a.mp4', outputSize: 1 });
    await flush();
    expect(started).toEqual(['a']);
  });

  it('cancels a running task by aborting its signal', async () => {
    let aborted = false;
    const tm = new TaskManager(
      (_task, _hooks, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            const err = new Error('任务已取消');
            err.name = 'ConversionCancelledError';
            reject(err);
          });
        }),
    );
    tm.add(makeTask('a'));
    await flush();
    expect(tm.list()[0].status).toBe('running');

    tm.cancel('a');
    await flush();
    expect(aborted).toBe(true);
    expect(tm.list()[0].status).toBe('cancelled');
  });

  it('marks failures with the error message remaining serial', async () => {
    const started: string[] = [];
    const tm = new TaskManager(async (task) => {
      started.push(task.id);
      if (task.id === 'a') throw new Error('视频文件已损坏');
      return { outputPath: task.outputPath, outputSize: 1 };
    });
    tm.add(makeTask('a'));
    tm.add(makeTask('b'));
    await flush(10);

    const [a, b] = tm.list();
    expect(a.status).toBe('failed');
    expect(a.errorMessage).toBe('视频文件已损坏');
    expect(b.status).toBe('completed');
    expect(started).toEqual(['a', 'b']);
  });

  it('clearFinished keeps pending/running tasks', async () => {
    const gate = deferred<{ outputPath: string; outputSize: number }>();
    const tm = new TaskManager(async (task) => {
      if (task.id === 'a') return gate.promise;
      return { outputPath: task.outputPath, outputSize: 1 };
    });
    tm.add(makeTask('a'));
    tm.add(makeTask('b'));
    await flush();
    tm.cancel('b');
    tm.clearFinished();
    expect(tm.list().map((t) => t.id)).toEqual(['a']);
    gate.resolve({ outputPath: 'C:\\out\\a.mp4', outputSize: 1 });
    await flush();
  });
});
