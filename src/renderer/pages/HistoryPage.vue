<script setup lang="ts">
import type { HistoryEntry } from '../../shared/types'
import { useAppStore } from '../stores/app'
import { FORMAT_LABELS, PRESET_LABELS, formatBytes, formatDate } from '../utils/format'

const store = useAppStore()

function sizeChange(e: HistoryEntry): { text: string; smaller: boolean } {
  if (!e.inputSize) return { text: '—', smaller: false }
  const delta = ((e.outputSize - e.inputSize) / e.inputSize) * 100
  const sign = delta > 0 ? '+' : ''
  return { text: `${sign}${delta.toFixed(1)}%`, smaller: delta <= 0 }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1 class="page-title">转换历史</h1>
      <button
        v-if="store.history.length"
        class="btn btn-ghost"
        @click="store.clearHistory()"
      >
        清空历史
      </button>
    </div>

    <div v-if="!store.history.length" class="panel empty-page">
      <p>暂无转换记录</p>
    </div>

    <div v-else class="panel history-table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th>输出文件</th>
            <th>格式</th>
            <th>预设</th>
            <th>大小变化</th>
            <th>时间</th>
            <th class="col-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in store.history" :key="e.id">
            <td class="td-name" :title="e.outputPath">{{ e.outputName }}</td>
            <td><span class="format-badge" :class="e.outputFormat">{{ FORMAT_LABELS[e.outputFormat] }}</span></td>
            <td>{{ PRESET_LABELS[e.preset] }}</td>
            <td>
              <span class="size-change">
                <span class="size-nums">{{ formatBytes(e.inputSize) }} → {{ formatBytes(e.outputSize) }}</span>
                <span class="pct" :class="sizeChange(e).smaller ? 'down' : 'up'">{{ sizeChange(e).text }}</span>
              </span>
            </td>
            <td class="td-time">{{ formatDate(e.completedAt) }}</td>
            <td class="col-actions">
              <div class="row-actions">
                <button class="btn btn-ghost btn-sm" @click="window.api.openPath(e.outputPath)">打开文件</button>
                <button class="btn btn-ghost btn-sm" @click="window.api.showItemInFolder(e.outputPath)">打开文件夹</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
