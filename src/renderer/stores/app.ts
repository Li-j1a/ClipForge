import { defineStore } from 'pinia'
import type {
  ConversionTask,
  EnqueueItem,
  FfmpegStatus,
  HistoryEntry,
  Settings,
  VideoInfo,
} from '../../shared/types'

export interface VideoEntry {
  path: string
  info: VideoInfo | null
  error: string | null
}

export type PageId = 'convert' | 'history' | 'settings'

let unsubscribe: (() => void) | null = null

function cleanError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '') || '操作失败'
}

export const useAppStore = defineStore('app', {
  state: () => ({
    videos: [] as VideoEntry[],
    importing: false,
    settings: null as Settings | null,
    tasks: [] as ConversionTask[],
    history: [] as HistoryEntry[],
    ffmpeg: null as FfmpegStatus | null,
    activePage: 'convert' as PageId,
    notice: null as string | null,
  }),

  getters: {
    validVideos(state): VideoEntry[] {
      return state.videos.filter((v) => v.info && !v.error)
    },
    hasVideos(state): boolean {
      return state.videos.some((v) => v.info && !v.error)
    },
    finishedTasks(state): ConversionTask[] {
      return state.tasks.filter((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')
    },
  },

  actions: {
    setPage(page: PageId) {
      this.activePage = page
    },

    clearNotice() {
      this.notice = null
    },

    async init() {
      if (unsubscribe) return
      unsubscribe = window.api.onTaskUpdate((task) => this.patchTask(task))
      await Promise.allSettled([
        this.loadSettings(),
        this.loadTasks(),
        this.loadFfmpeg(),
        this.loadHistory(),
      ])
    },

    dispose() {
      unsubscribe?.()
      unsubscribe = null
    },

    patchTask(task: ConversionTask) {
      const i = this.tasks.findIndex((t) => t.id === task.id)
      if (i >= 0) this.tasks[i] = task
      else this.tasks.push(task)
    },

    mergeTasks(incoming: ConversionTask[]) {
      for (const task of incoming) this.patchTask(task)
    },

    async importVideos(paths: string[]) {
      const unique = [...new Set(paths)]
      const fresh = unique.filter((p) => !this.videos.some((v) => v.path === p))
      if (!fresh.length) return
      this.importing = true
      try {
        const results = await window.api.importVideos(fresh)
        for (const r of results) {
          if (r.ok && r.info) {
            this.videos.push({ path: r.path, info: r.info, error: null })
          } else {
            this.videos.push({ path: r.path, info: r.info ?? null, error: r.error ?? '读取媒体信息失败' })
          }
        }
      } catch (err) {
        this.notice = cleanError(err)
      } finally {
        this.importing = false
      }
    },

    removeVideo(path: string) {
      this.videos = this.videos.filter((v) => v.path !== path)
    },

    clearVideos() {
      this.videos = []
    },

    async startConversion() {
      if (!this.hasVideos || !this.settings) return
      if (this.ffmpeg && !this.ffmpeg.ok) {
        this.notice = 'FFmpeg 不可用，请先在「设置」中配置后再开始转换。'
        return
      }
      const s = this.settings
      const items: EnqueueItem[] = this.validVideos.map((v) => ({
        inputPath: v.info!.path,
        inputName: v.info!.name,
        inputSize: v.info!.fileSize,
        inputFormat: v.info!.format,
        duration: v.info!.duration,
        outputFormat: s.defaultFormat,
        preset: s.defaultPreset,
        outputDir: s.outputDir,
      }))
      try {
        const tasks = await window.api.enqueue(items)
        this.mergeTasks(tasks)
        this.clearVideos()
        this.setPage('convert')
      } catch (err) {
        this.notice = cleanError(err)
      }
    },

    async cancelTask(id: string) {
      await window.api.cancelTask(id)
    },

    async clearFinished() {
      await window.api.clearFinished()
      this.tasks = this.tasks.filter((t) => t.status === 'pending' || t.status === 'running')
    },

    async loadSettings() {
      this.settings = await window.api.getSettings()
    },

    async updateSettings(patch: Partial<Settings>) {
      this.settings = await window.api.updateSettings(patch)
    },

    async loadFfmpeg() {
      this.ffmpeg = await window.api.getFfmpegStatus()
    },

    async setFfmpegPaths(paths: { ffmpegPath?: string | null; ffprobePath?: string | null }) {
      this.ffmpeg = await window.api.setFfmpegPaths(paths)
    },

    async loadTasks() {
      this.tasks = await window.api.getTasks()
    },

    async loadHistory() {
      this.history = await window.api.getHistory()
    },

    async clearHistory() {
      await window.api.clearHistory()
      this.history = []
    },
  },
})
