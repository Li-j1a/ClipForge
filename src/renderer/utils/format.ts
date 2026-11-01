import type { OutputFormat, Preset } from '../../shared/types'

export const FORMAT_LABELS: Record<OutputFormat, string> = {
  mp4: 'MP4 通用格式',
  mkv: 'MKV 本地存储',
  webm: 'WebM 网页格式',
}

export const PRESET_LABELS: Record<Preset, string> = {
  compatibility: '兼容性优先',
  'high-quality': '高清画质',
  'small-size': '节省空间',
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const v = bytes / Math.pow(1024, i)
  const text = v >= 100 || i === 0 ? String(Math.round(v)) : v.toFixed(1)
  return `${text} ${units[i]}`
}

export function formatDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—'
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const mm = String(m).padStart(2, '0')
  const sss = String(ss).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${sss}` : `${mm}:${sss}`
}

export function formatFps(fps: number | null): string {
  if (fps == null || !Number.isFinite(fps) || fps <= 0) return '—'
  if (Number.isInteger(fps)) return String(fps)
  return fps.toFixed(2).replace(/\.?0+$/, '')
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
