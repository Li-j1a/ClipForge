<script setup lang="ts">
import type { ConversionTask } from '../../shared/types'
import { useAppStore } from '../stores/app'
import { FORMAT_LABELS, PRESET_LABELS, formatBytes } from '../utils/format'

const store = useAppStore()

const STATUS_LABELS: Record<ConversionTask['status'], string> = {
  pending: '等待中',
  running: '转换中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

function percent(t: ConversionTask): string {
  if (!Number.isFinite(t.progress)) return '0'
  return `${Math.min(100, Math.max(0, t.progress)).toFixed(0)}%`
}
</script>

<template>
  <div class="panel task-panel">
    <div class="task-panel-head">
      <h2 class="panel-title">转换队列</h2>
      <button
        v-if="store.finishedTasks.length"
        class="btn btn-ghost btn-sm"
        @click="store.clearFinished()"
      >
        清空已结束
      </button>
    </div>

    <div v-if="!store.tasks.length" class="task-empty">暂无转换任务</div>

    <ul v-else class="task-list">
      <li v-for="t in store.tasks" :key="t.id" class="task-item">
        <div class="task-top">
          <span class="task-name" :title="t.inputName">{{ t.inputName }}</span>
          <span class="status-badge" :class="t.status">{{ STATUS_LABELS[t.status] }}</span>
        </div>

        <div class="task-meta">
          <span class="chip">{{ t.outputFormat.toUpperCase() }} · {{ FORMAT_LABELS[t.outputFormat] }}</span>
          <span class="chip">{{ PRESET_LABELS[t.preset] }}</span>
          <span class="chip">{{ formatBytes(t.inputSize) }}</span>
          <span v-if="t.outputSize" class="chip">→ {{ formatBytes(t.outputSize) }}</span>
        </div>

        <div v-if="t.status === 'running' || t.status === 'pending'" class="task-progress">
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: percent(t) }" />
          </div>
          <span class="progress-text">{{ t.status === 'running' ? percent(t) : '等待中' }}</span>
          <span v-if="t.status === 'running' && t.speed" class="speed-text">{{ t.speed }}</span>
        </div>

        <div v-if="t.status === 'failed' && t.errorMessage" class="task-error">{{ t.errorMessage }}</div>

        <div class="task-actions">
          <button
            v-if="t.status === 'running' || t.status === 'pending'"
            class="btn btn-ghost btn-sm"
            @click="store.cancelTask(t.id)"
          >
            取消
          </button>
          <template v-if="t.status === 'completed'">
            <button class="btn btn-ghost btn-sm" @click="window.api.openPath(t.outputPath)">打开文件</button>
            <button class="btn btn-ghost btn-sm" @click="window.api.showItemInFolder(t.outputPath)">打开文件夹</button>
          </template>
        </div>
      </li>
    </ul>
  </div>
</template>
