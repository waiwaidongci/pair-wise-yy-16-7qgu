// 策展发布台 —— 纯逻辑：基线构造、逐字段合并、冲突派生、哈希、校验
import { photos } from '../data'
import type {
  Baseline,
  Operation,
  Conflict,
  Derived,
  Snapshot,
  Source,
} from './types'

// 简单确定性哈希（cyrb53 变体），用于派生结果失效判定
export function hashString(str: string): string {
  let h1 = 0xdeadbeef ^ 0x9e3779b9
  let h2 = 0x41c6ce57 ^ 0x85ebca6b
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2246822519)
    h2 = Math.imul(h2 ^ ch, 3266489917)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 13), 2246822519)
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489917)
  h1 ^= h2
  h2 ^= h1
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

export function hashContent(baseline: Baseline, ops: Operation[]): string {
  const payload = JSON.stringify({
    b: baseline.id,
    p: baseline.photos,
    o: ops
      .slice()
      .sort((a, b) => a.opNo.localeCompare(b.opNo))
      .map(o => `${o.opNo}:${o.photoId}:${o.field}:${o.newValue}`),
  })
  return hashString(payload)
}

// 从 photos.json 构造冻结基线（初始内容）
export function buildBaseline(id: string, frozenAt: number): Baseline {
  const photosMap: Baseline['photos'] = {}
  const cropsMap: Baseline['crops'] = {}
  for (const p of photos) {
    photosMap[p.id] = {
      title: p.title,
      caption: p.caption,
      order: p.order,
      cover: p.order === 1,
    }
    cropsMap[p.id] = { cropped: false, ratio: '原始' }
  }
  return { id, frozenAt, photos: photosMap, crops: cropsMap }
}

// 取最新已发布快照的内容（新基线冻结「当前线上内容」）
export function liveContent(snapshots: Snapshot[]): Baseline['photos'] | null {
  if (snapshots.length === 0) return null
  const latest = snapshots.reduce((a, b) => (a.publishedAt > b.publishedAt ? a : b))
  return latest.content
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function applyValue(
  target: Baseline['photos'][string],
  field: string,
  value: string,
): void {
  if (field === 'order') {
    target.order = Number(value)
  } else if (field === 'cover') {
    target.cover = value === 'true'
  } else if (field === 'title') {
    target.title = value
  } else if (field === 'caption') {
    target.caption = value
  }
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

function latestOp(ops: Operation[]): Operation {
  return ops.reduce((a, b) => (a.at > b.at ? a : b))
}

// 逐字段合并：同一张照片同一字段只被一方改 → 应用；被双方都改 → 保留双方待裁决
export function mergeOps(
  baseline: Baseline,
  ops: Operation[],
  conflictIdStart = 0,
): { content: Baseline['photos']; conflicts: Conflict[] } {
  const content = clone(baseline.photos)
  const conflicts: Conflict[] = []
  let seq = conflictIdStart

  const groups = new Map<string, Operation[]>()
  for (const op of ops) {
    const key = `${op.photoId}::${op.field}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(op)
  }

  for (const [key, group] of groups) {
    const [photoId, field] = key.split('::')
    const sources = unique(group.map(o => o.source))
    if (sources.length === 1) {
      const op = latestOp(group)
      applyValue(content[photoId], field, op.newValue)
    } else {
      const versions = sources.map(s => {
        const op = latestOp(group.filter(o => o.source === s))
        return { source: s as Source, opNo: op.opNo, value: op.newValue }
      })
      conflicts.push({
        id: `CF-${String(++seq).padStart(3, '0')}`,
        photoId,
        field,
        versions,
        status: 'pending',
        chosenSource: null,
      })
    }
  }

  return { content, conflicts }
}

// 在合并基础上，应用已裁决的选择，得到最终派生内容
export function deriveContent(
  baseline: Baseline,
  ops: Operation[],
  conflicts: Conflict[],
): Baseline['photos'] {
  const content = clone(baseline.photos)
  const groups = new Map<string, Operation[]>()
  for (const op of ops) {
    const key = `${op.photoId}::${op.field}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(op)
  }

  for (const [key, group] of groups) {
    const [photoId, field] = key.split('::')
    const sources = unique(group.map(o => o.source))
    if (sources.length === 1) {
      applyValue(content[photoId], field, latestOp(group).newValue)
    } else {
      const conflict = conflicts.find(
        c => c.photoId === photoId && c.field === field,
      )
      if (conflict && conflict.status === 'adjudicated' && conflict.chosenSource) {
        const op = latestOp(group.filter(o => o.source === conflict.chosenSource))
        applyValue(content[photoId], field, op.newValue)
      }
      // 未裁决的冲突字段：保留基线值（不应用任何一方）
    }
  }
  return content
}

export function pendingConflicts(conflicts: Conflict[]): number {
  return conflicts.filter(c => c.status === 'pending').length
}

export function allCropped(crops: Baseline['crops']): boolean {
  return Object.values(crops).every(c => c.cropped)
}

export function uncroppedPhotos(crops: Baseline['crops']): string[] {
  return Object.entries(crops)
    .filter(([, c]) => !c.cropped)
    .map(([id]) => id)
}

export function makeDerived(
  baseline: Baseline,
  ops: Operation[],
  conflicts: Conflict[],
): Derived {
  return {
    hash: hashContent(baseline, ops),
    valid: true,
    content: deriveContent(baseline, ops, conflicts),
    computedAt: Date.now(),
  }
}
