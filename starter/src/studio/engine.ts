/* ---------------------------------------------------------------------------
 * 策展发布台（Curator Console）核心引擎
 *
 * 纯函数、零 DOM 依赖，可直接在 vitest 下单测。所有状态变更都走 reduce 风格的
 * 纯函数；React 层只负责持久化（localStorage）与界面。
 *
 * 规则对应（任务需求）：
 *  1. 每批发布先冻结基线                -> freezeBaseline()
 *  2. 离线操作带操作号和来源            -> submitOp() 的 opId / source，日志记录 online
 *  3. 恢复后逐字段合并                  -> sync() 三方合并（baseline / lead / collaborator）
 *  4. 同一张照片两边都改：保留双方待裁决 -> mergeField() 产出 pending Conflict
 *  5. 未裁完不能发布                    -> evaluateGate() 检查 crop
 *  6. 已发布快照不能被新草稿回写        -> publish() 深冻结快照，草稿只写 canonical/branches
 *  7. 基线或排序变化让未发布派生结果失效 -> invalidateDerived() + recomputeDerived()
 *  8. 重复重试沿用首次结果              -> submitOp() 按 opId 幂等
 *  9. 主策展人可强制发布，协作者 403     -> publish(force, role)
 * ------------------------------------------------------------------------- */

import type { PhotoData } from '../data/photos'

export type Role = 'lead' | 'collaborator'
export type Source = 'lead' | 'collaborator'

export interface CropRect {
  /** 归一化裁剪框（0~1，相对原图） */
  x: number
  y: number
  w: number
  h: number
}

export interface PhotoDraft {
  id: string
  title: string
  caption: string
  altText: string
  order: number
  crop: CropRect | null
}

export interface SeriesDraft {
  id: string
  title: string
  summary: string
  coverPhotoId: string
}

export interface ContentState {
  photos: Record<string, PhotoDraft>
  series: Record<string, SeriesDraft>
}

export type EntityKind = 'photo' | 'series'

export const PHOTO_FIELDS = ['title', 'caption', 'altText', 'order', 'crop'] as const
export const SERIES_FIELDS = ['title', 'summary', 'coverPhotoId'] as const

export type PhotoField = (typeof PHOTO_FIELDS)[number]
export type SeriesField = (typeof SERIES_FIELDS)[number]

// --- 操作（离线期间在两台设备上各自产生，带操作号与来源） -------------------

export type EditKind = 'set-field' | 'set-crop' | 'reorder'
export type LogKind = EditKind | 'freeze' | 'sync' | 'adjudicate' | 'publish'

export interface Operation {
  opId: string
  batchId: string
  source: Source
  ts: number
  online: boolean
  kind: EditKind
  entity?: EntityKind
  entityId?: string
  field?: string
  value?: unknown
  /** reorder 专用：目标系列 */
  seriesId?: string
  /** reorder 专用：该系列照片 id 的目标顺序 */
  orderedIds?: string[]
}

export type OutcomeStatus =
  | 'applied' // 首次应用成功
  | 'duplicate' // 重复重试：沿用首次结果
  | 'rejected' // 被拒绝（如批次已发布/403）
  | 'blocked' // 发布门禁未通过
  | 'published' // 发布成功
  | 'merged' // 合并完成（可能带冲突）
  | 'resolved' // 裁决完成

export interface OpOutcome {
  status: OutcomeStatus
  accepted: boolean
  /** duplicate 时指向首次结果的状态 */
  firstStatus?: OutcomeStatus
  message: string
  conflictKeys?: string[]
  code?: number
  at: number
}

export interface LogEntry {
  opId: string
  batchId: string | null
  source: Source | 'system'
  ts: number
  online: boolean
  kind: LogKind
  detail: string
  outcome: OpOutcome
}

// --- 冲突 ------------------------------------------------------------------

export interface Conflict {
  key: string // `${entity}:${entityId}:${field}`
  entity: EntityKind
  entityId: string
  field: string
  localSource: Source
  localValue: unknown
  remoteValue: unknown
  status: 'pending' | 'resolved'
  winner?: unknown
  resolvedBy?: Source
  resolvedAt?: number
}

// --- 派生结果（封面/发布预览看板，由内容与排序派生） -------------------------

export interface DerivedItem {
  photoId: string
  title: string
  order: number
  cropped: boolean
}

export interface DerivedBoard {
  seriesId: string
  hash: string
  items: DerivedItem[]
  total: number
  croppedCount: number
  computedAt: number
}

// --- 批次与快照 -------------------------------------------------------------

export type BatchStatus = 'active' | 'published'

export interface Batch {
  id: string
  seriesId: string
  frozenAt: number
  status: BatchStatus
  /** 冻结基线：批次开始时刻的内容，之后绝不修改 */
  baseline: ContentState
  /** 两台设备各自的离线工作副本 */
  branches: Record<Source, ContentState>
  merged: ContentState | null
  syncedAt: number | null
  conflicts: Conflict[]
  derived: {
    board: DerivedBoard | null
    stale: boolean
    reason: string | null
  }
  snapshotId: string | null
}

export interface PublishedSnapshot {
  id: string
  batchId: string
  seriesId: string
  version: number
  forced: boolean
  warnings: string[]
  publishedAt: number
  publishedBy: Source
  /** 深冻结内容；任何后续草稿都无法回写它 */
  content: ContentState
  board: DerivedBoard
}

export interface StudioState {
  role: Role
  online: boolean
  /** 当前事实内容：新批次冻结基线时取它；发布后与已发布快照一致 */
  canonical: ContentState
  batches: Record<string, Batch>
  batchOrder: string[]
  activeBatchId: string | null
  log: LogEntry[]
  snapshots: PublishedSnapshot[]
  seq: number
}

export interface GateReport {
  pass: boolean
  uncroppedPhotoIds: string[]
  pendingConflictKeys: string[]
  reasons: string[]
}

// ===========================================================================
// 基础工具
// ===========================================================================

export function cloneContent(content: ContentState): ContentState {
  return structuredClone(content)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a && b && typeof a === 'object') {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
      return a.every((v, i) => deepEqual(v, b[i]))
    }
    const ka = Object.keys(a as Record<string, unknown>)
    const kb = Object.keys(b as Record<string, unknown>)
    if (ka.length !== kb.length) return false
    return ka.every(k =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    )
  }
  return false
}

/** 稳定序列化（对象键排序）后做 FNV-1a 哈希，用于派生结果失效判断。 */
export function stableHash(value: unknown): string {
  const seen = new WeakSet<object>()
  const normalize = (v: unknown): string => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v)
    if (seen.has(v as object)) return '"<circular>"'
    seen.add(v as object)
    if (Array.isArray(v)) return `[${v.map(normalize).join(',')}]`
    const keys = Object.keys(v as Record<string, unknown>).sort()
    return `{${keys.map(k => `${JSON.stringify(k)}:${normalize((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  const str = normalize(value)
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const k of Object.keys(value as Record<string, unknown>)) {
      freezeDeep((value as Record<string, unknown>)[k])
    }
  }
  return value
}

// ===========================================================================
// 初始化
// ===========================================================================

export function createInitialContent(data: PhotoData): ContentState {
  const photos: Record<string, PhotoDraft> = {}
  for (const p of data.photos) {
    photos[p.id] = {
      id: p.id,
      title: p.title,
      caption: p.caption,
      altText: p.altText,
      order: p.order,
      crop: null, // 初始均未裁切
    }
  }
  const series: Record<string, SeriesDraft> = {}
  for (const s of data.series) {
    series[s.id] = {
      id: s.id,
      title: s.title,
      summary: s.summary,
      coverPhotoId: [...s.photoIds].sort().reduce((a, b) =>
        photos[a].order <= photos[b].order ? a : b,
      ),
    }
  }
  return { photos, series }
}

export function initState(canonical: ContentState): StudioState {
  return {
    role: 'lead',
    online: true,
    canonical: cloneContent(canonical),
    batches: {},
    batchOrder: [],
    activeBatchId: null,
    log: [],
    snapshots: [],
    seq: 0,
  }
}

export function newOpId(seq: number): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `op-${String(seq + 1).padStart(4, '0')}-${rand}`
}

export function activeBatch(state: StudioState): Batch | null {
  return state.activeBatchId ? state.batches[state.activeBatchId] ?? null : null
}

// ===========================================================================
// 会话级动作
// ===========================================================================

export function setRole(state: StudioState, role: Role): StudioState {
  return { ...state, role }
}

export function setOnline(state: StudioState, online: boolean): StudioState {
  return { ...state, online }
}

// ===========================================================================
// 1) 冻结基线
// ===========================================================================

export function freezeBaseline(
  state: StudioState,
  seriesId: string,
  now: number,
): { state: StudioState; batchId: string } {
  const seq = state.seq + 1
  const batchId = `batch-${String(seq).padStart(3, '0')}`
  const baseline = freezeDeep(cloneContent(state.canonical)) as ContentState
  const batch: Batch = {
    id: batchId,
    seriesId,
    frozenAt: now,
    status: 'active',
    baseline,
    branches: {
      lead: cloneContent(baseline),
      collaborator: cloneContent(baseline),
    },
    merged: null,
    syncedAt: null,
    conflicts: [],
    // 新基线一旦冻结，之前一切未发布派生结果立即失效
    derived: { board: null, stale: true, reason: '已冻结新基线，派生结果待重算' },
    snapshotId: null,
  }
  const entry: LogEntry = {
    opId: `op-freeze-${batchId}`,
    batchId,
    source: 'system',
    ts: now,
    online: state.online,
    kind: 'freeze',
    detail: `冻结发布基线（批次 ${batchId}，范围：系列 ${seriesId}）`,
    outcome: {
      status: 'applied',
      accepted: true,
      message: '基线已冻结，两侧工作副本从同一基线克隆',
      at: now,
    },
  }
  return {
    state: {
      ...state,
      seq,
      activeBatchId: batchId,
      batches: { ...state.batches, [batchId]: batch },
      batchOrder: [...state.batchOrder, batchId],
      log: [entry, ...state.log],
    },
    batchId,
  }
}

// ===========================================================================
// 2) 提交离线操作（带操作号、来源；重复 opId 幂等）
// ===========================================================================

function fieldValue(content: ContentState, entity: EntityKind, id: string, field: string) {
  const bag = entity === 'photo' ? content.photos[id] : content.series[id]
  return bag ? (bag as unknown as Record<string, unknown>)[field] : undefined
}

function setFieldValue(
  content: ContentState,
  entity: EntityKind,
  id: string,
  field: string,
  value: unknown,
) {
  const bag = entity === 'photo' ? content.photos[id] : content.series[id]
  if (bag) (bag as unknown as Record<string, unknown>)[field] = value
}

function invalidateDerived(batch: Batch, reason: string): Batch {
  return { ...batch, derived: { ...batch.derived, stale: true, reason } }
}

export function submitOp(
  prev: StudioState,
  op: Operation,
): { state: StudioState; outcome: OpOutcome } {
  const batch = prev.batches[op.batchId]

  // 幂等：同一操作号重试，直接沿用首次结果，绝不二次应用。
  const existing = prev.log.find(e => e.opId === op.opId)
  if (existing) {
    const outcome: OpOutcome = {
      status: 'duplicate',
      accepted: false,
      firstStatus: existing.outcome.status,
      message: `操作号 ${op.opId} 已处理过，沿用首次结果（${existing.outcome.status}）`,
      at: op.ts,
    }
    return {
      state: {
        ...prev,
        log: [
          {
            opId: op.opId,
            batchId: op.batchId,
            source: op.source,
            ts: op.ts,
            online: op.online,
            kind: op.kind,
            detail: `重复重试 · ${describeOp(op)}`,
            outcome,
          },
          ...prev.log,
        ],
      },
      outcome,
    }
  }

  if (!batch) {
    return {
      state: prev,
      outcome: {
        status: 'rejected',
        accepted: false,
        code: 404,
        message: `批次 ${op.batchId} 不存在`,
        at: op.ts,
      },
    }
  }
  if (batch.status === 'published') {
    return {
      state: prev,
      outcome: {
        status: 'rejected',
        accepted: false,
        code: 409,
        message: '该批次已发布，快照不可变；请冻结新基线后再修改',
        at: op.ts,
      },
    }
  }

  const next: StudioState = { ...prev, batches: { ...prev.batches } }
  const working = cloneContent(batch.branches[op.source])
  let invalidationReason: string | null = null

  if (op.kind === 'set-field' && op.entity && op.entityId && op.field) {
    setFieldValue(working, op.entity, op.entityId, op.field, op.value)
    if (op.field === 'order') invalidationReason = '排序已变化，未发布派生结果失效'
  } else if (op.kind === 'set-crop' && op.entityId) {
    setFieldValue(working, 'photo', op.entityId, 'crop', op.value ?? null)
  } else if (op.kind === 'reorder' && op.seriesId && op.orderedIds) {
    op.orderedIds.forEach((id, i) => {
      if (working.photos[id]) working.photos[id].order = i + 1
    })
    invalidationReason = '排序已变化，未发布派生结果失效'
  } else {
    return {
      state: prev,
      outcome: {
        status: 'rejected',
        accepted: false,
        code: 400,
        message: '非法操作：缺少必要字段',
        at: op.ts,
      },
    }
  }

  let updated: Batch = {
    ...batch,
    branches: { ...batch.branches, [op.source]: working },
  }
  if (invalidationReason) updated = invalidateDerived(updated, invalidationReason)
  // 任何内容改动后，未同步的旧合并结果也必须作废，避免拿旧合并去发布
  if (updated.merged) {
    updated = { ...updated, merged: null, syncedAt: null, conflicts: [] }
  }
  next.batches[op.batchId] = updated

  const outcome: OpOutcome = {
    status: 'applied',
    accepted: true,
    message: op.online
      ? '已应用（在线）'
      : '离线暂存于本机工作副本，回网后随操作日志同步合并',
    at: op.ts,
  }
  next.log = [
    {
      opId: op.opId,
      batchId: op.batchId,
      source: op.source,
      ts: op.ts,
      online: op.online,
      kind: op.kind,
      detail: describeOp(op),
      outcome,
    },
    ...prev.log,
  ]
  return { state: next, outcome }
}

function describeOp(op: Operation): string {
  switch (op.kind) {
    case 'set-crop':
      return `裁切照片 ${op.entityId}`
    case 'reorder':
      return `重排系列 ${op.seriesId}：${op.orderedIds?.join(' → ')}`
    case 'set-field':
      return `修改 ${op.entity} ${op.entityId} 的 ${op.field} = ${JSON.stringify(op.value)}`
  }
}

// ===========================================================================
// 3) 回网：逐字段三方合并，冲突双方保留待裁决
// ===========================================================================

function entityEntries(content: ContentState): Array<[EntityKind, string]> {
  return [
    ...Object.keys(content.photos).map(id => ['photo', id] as [EntityKind, string]),
    ...Object.keys(content.series).map(id => ['series', id] as [EntityKind, string]),
  ]
}

function fieldsFor(entity: EntityKind): readonly string[] {
  return entity === 'photo' ? PHOTO_FIELDS : SERIES_FIELDS
}

export function sync(
  prev: StudioState,
  now: number,
): { state: StudioState; outcome: OpOutcome } {
  const batch = activeBatch(prev)
  if (!batch) {
    return {
      state: prev,
      outcome: { status: 'rejected', accepted: false, code: 400, message: '没有进行中的批次', at: now },
    }
  }

  const base = batch.baseline
  const lead = batch.branches.lead
  const collab = batch.branches.collaborator
  const merged = cloneContent(base)
  const conflicts: Conflict[] = []

  for (const [entity, id] of entityEntries(base)) {
    for (const field of fieldsFor(entity)) {
      const b = fieldValue(base, entity, id, field)
      const l = fieldValue(lead, entity, id, field)
      const r = fieldValue(collab, entity, id, field)
      const leadChanged = !deepEqual(l, b)
      const collabChanged = !deepEqual(r, b)

      let winner: unknown = b
      if (!leadChanged && !collabChanged) {
        winner = b
      } else if (leadChanged && !collabChanged) {
        winner = l
      } else if (!leadChanged && collabChanged) {
        winner = r
      } else if (deepEqual(l, r)) {
        winner = l // 两边改成同一个值
      } else {
        // 两边都改且不一致：保留双方，待裁决。合并稿先采用本方值占位，
        // 但冲突未解决前门禁不允许发布。
        winner = l
        conflicts.push({
          key: `${entity}:${id}:${field}`,
          entity,
          entityId: id,
          field,
          localSource: 'lead',
          localValue: l,
          remoteValue: r,
          status: 'pending',
        })
      }
      setFieldValue(merged, entity, id, field, winner)
    }
  }

  const updated: Batch = invalidateDerived(
    {
      ...batch,
      merged,
      syncedAt: now,
      conflicts,
    },
    '合并产生新内容，派生结果待重算',
  )

  const outcome: OpOutcome = {
    status: 'merged',
    accepted: true,
    conflictKeys: conflicts.map(c => c.key),
    message:
      conflicts.length === 0
        ? '逐字段合并完成，无冲突'
        : `逐字段合并完成，${conflicts.length} 个字段双方都改了，已保留双方待裁决`,
    at: now,
  }
  const entry: LogEntry = {
    opId: `op-sync-${batch.id}-${now}`,
    batchId: batch.id,
    source: 'system',
    ts: now,
    online: true,
    kind: 'sync',
    detail: '回网同步 · 三方逐字段合并',
    outcome,
  }
  return {
    state: {
      ...prev,
      batches: { ...prev.batches, [batch.id]: updated },
      log: [entry, ...prev.log],
    },
    outcome,
  }
}

// ===========================================================================
// 4) 裁决冲突
// ===========================================================================

export function adjudicate(
  prev: StudioState,
  conflictKey: string,
  choice: 'local' | 'remote' | 'custom',
  by: Source,
  now: number,
  customValue?: unknown,
): { state: StudioState; outcome: OpOutcome } {
  const batch = activeBatch(prev)
  if (!batch || !batch.merged) {
    return {
      state: prev,
      outcome: { status: 'rejected', accepted: false, code: 400, message: '尚未合并，无可裁决项', at: now },
    }
  }
  const conflict = batch.conflicts.find(c => c.key === conflictKey)
  if (!conflict) {
    return {
      state: prev,
      outcome: { status: 'rejected', accepted: false, code: 404, message: `冲突 ${conflictKey} 不存在`, at: now },
    }
  }
  const winner =
    choice === 'local'
      ? conflict.localValue
      : choice === 'remote'
        ? conflict.remoteValue
        : customValue
  const merged = cloneContent(batch.merged)
  setFieldValue(merged, conflict.entity, conflict.entityId, conflict.field, winner)
  const conflicts = batch.conflicts.map(c =>
    c.key === conflictKey
      ? { ...c, status: 'resolved' as const, winner, resolvedBy: by, resolvedAt: now }
      : c,
  )
  const updated = invalidateDerived(
    { ...batch, merged, conflicts },
    '裁决改变了合并内容，派生结果待重算',
  )
  const outcome: OpOutcome = {
    status: 'resolved',
    accepted: true,
    message: `冲突 ${conflictKey} 已裁决，采用${choice === 'local' ? '本方' : choice === 'remote' ? '对方' : '自定义'}值`,
    at: now,
  }
  return {
    state: {
      ...prev,
      batches: { ...prev.batches, [batch.id]: updated },
      log: [
        {
          opId: `op-adj-${conflictKey}-${now}`,
          batchId: batch.id,
          source: by,
          ts: now,
          online: prev.online,
          kind: 'adjudicate',
          detail: `裁决 ${conflictKey} → ${choice}`,
          outcome,
        },
        ...prev.log,
      ],
    },
    outcome,
  }
}

// ===========================================================================
// 5) 派生结果：失效后重算（哈希校验，输入未变则沿用缓存）
// ===========================================================================

export function computeBoard(
  content: ContentState,
  seriesId: string,
  memberIds: string[],
  now: number,
): DerivedBoard {
  const items: DerivedItem[] = memberIds
    .map(id => content.photos[id])
    .filter(Boolean)
    .sort((a, b) => a.order - b.order)
    .map(p => ({
      photoId: p.id,
      title: p.title,
      order: p.order,
      cropped: p.crop !== null,
    }))
  const hash = stableHash({
    seriesId,
    cover: content.series[seriesId]?.coverPhotoId,
    items: items.map(i => ({ ...i })),
  })
  return {
    seriesId,
    hash,
    items,
    total: items.length,
    croppedCount: items.filter(i => i.cropped).length,
    computedAt: now,
  }
}

export function recomputeDerived(
  prev: StudioState,
  memberIdsBySeries: Record<string, string[]>,
  now: number,
): StudioState {
  const batch = activeBatch(prev)
  if (!batch) return prev
  const content = batch.merged ?? batch.baseline
  const memberIds = memberIdsBySeries[batch.seriesId] ?? []
  const board = computeBoard(content, batch.seriesId, memberIds, now)
  const cached = batch.derived.board
  // 输入哈希未变：沿用首次计算结果（不产生新版本）
  if (cached && cached.hash === board.hash) {
    return {
      ...prev,
      batches: {
        ...prev.batches,
        [batch.id]: { ...batch, derived: { board: cached, stale: false, reason: null } },
      },
    }
  }
  return {
    ...prev,
    batches: {
      ...prev.batches,
      [batch.id]: { ...batch, derived: { board, stale: false, reason: null } },
    },
  }
}

// ===========================================================================
// 6) 发布门禁
// ===========================================================================

export function evaluateGate(
  state: StudioState,
  memberIdsBySeries: Record<string, string[]>,
): GateReport {
  const batch = activeBatch(state)
  const reasons: string[] = []
  if (!batch) {
    return { pass: false, uncroppedPhotoIds: [], pendingConflictKeys: [], reasons: ['没有进行中的批次'] }
  }
  const content = batch.merged
  if (!content) {
    return {
      pass: false,
      uncroppedPhotoIds: [],
      pendingConflictKeys: [],
      reasons: ['尚未回网合并，不能发布'],
    }
  }
  const memberIds = memberIdsBySeries[batch.seriesId] ?? []
  const uncroppedPhotoIds = memberIds.filter(id => content.photos[id]?.crop == null)
  if (uncroppedPhotoIds.length > 0) {
    reasons.push(`仍有 ${uncroppedPhotoIds.length} 张照片未裁切，未裁完不能发布`)
  }
  const pendingConflictKeys = batch.conflicts.filter(c => c.status === 'pending').map(c => c.key)
  if (pendingConflictKeys.length > 0) {
    reasons.push(`仍有 ${pendingConflictKeys.length} 个字段冲突待裁决`)
  }
  if (batch.derived.stale || !batch.derived.board) {
    reasons.push('派生结果已失效，请先重算发布预览')
  }
  return {
    pass: reasons.length === 0,
    uncroppedPhotoIds,
    pendingConflictKeys,
    reasons,
  }
}

// ===========================================================================
// 7) 发布（快照深冻结；协作者强制发布 -> 403）
// ===========================================================================

export interface PublishResult {
  state: StudioState
  outcome: OpOutcome
  snapshot: PublishedSnapshot | null
}

export function publish(
  prev: StudioState,
  memberIdsBySeries: Record<string, string[]>,
  opts: { force: boolean; by: Role },
  now: number,
): PublishResult {
  const batch = activeBatch(prev)
  if (!batch) {
    return {
      state: prev,
      outcome: { status: 'rejected', accepted: false, code: 400, message: '没有进行中的批次', at: now },
      snapshot: null,
    }
  }

  // 权限：协作者任何强制发布尝试一律 403。
  if (opts.force && opts.by === 'collaborator') {
    const outcome: OpOutcome = {
      status: 'rejected',
      accepted: false,
      code: 403,
      message: '403 Forbidden：协作者无权强制发布，仅主策展人可强制执行',
      at: now,
    }
    return {
      state: {
        ...prev,
        log: [
          {
            opId: `op-pub-403-${batch.id}-${now}`,
            batchId: batch.id,
            source: 'collaborator',
            ts: now,
            online: prev.online,
            kind: 'publish',
            detail: '协作者尝试强制发布 → 403',
            outcome,
          },
          ...prev.log,
        ],
      },
      outcome,
      snapshot: null,
    }
  }

  const gate = evaluateGate(prev, memberIdsBySeries)
  if (!gate.pass && !opts.force) {
    const outcome: OpOutcome = {
      status: 'blocked',
      accepted: false,
      code: 422,
      conflictKeys: gate.pendingConflictKeys,
      message: `发布被门禁阻止：${gate.reasons.join('；')}`,
      at: now,
    }
    return {
      state: {
        ...prev,
        log: [
          {
            opId: `op-pub-block-${batch.id}-${now}`,
            batchId: batch.id,
            source: opts.by,
            ts: now,
            online: prev.online,
            kind: 'publish',
            detail: '发布被门禁阻止',
            outcome,
          },
          ...prev.log,
        ],
      },
      outcome,
      snapshot: null,
    }
  }

  // 强制发布也要有合并稿
  const content = batch.merged
  if (!content) {
    return {
      state: prev,
      outcome: { status: 'blocked', accepted: false, code: 422, message: '尚未回网合并，不能发布', at: now },
      snapshot: null,
    }
  }

  const memberIds = memberIdsBySeries[batch.seriesId] ?? []
  const board = computeBoard(content, batch.seriesId, memberIds, now)
  const version = prev.snapshots.filter(s => s.seriesId === batch.seriesId).length + 1
  const warnings = opts.force ? gate.reasons : []
  const snapshot: PublishedSnapshot = freezeDeep({
    id: `snap-${batch.seriesId}-v${version}`,
    batchId: batch.id,
    seriesId: batch.seriesId,
    version,
    forced: opts.force,
    warnings,
    publishedAt: now,
    publishedBy: opts.by,
    content: cloneContent(content),
    board,
  })

  const updatedBatch: Batch = {
    ...batch,
    status: 'published',
    snapshotId: snapshot.id,
    derived: { board, stale: false, reason: null },
  }
  const outcome: OpOutcome = {
    status: 'published',
    accepted: true,
    message: opts.force
      ? `已由主策展人强制发布（v${version}），覆盖 ${warnings.length} 项门禁警告；快照自此不可变`
      : `发布成功（v${version}），快照已冻结，新草稿无法回写`,
    at: now,
  }
  return {
    state: {
      ...prev,
      // 发布后 canonical 与快照对齐；之后的草稿从新基线出发，碰不到旧快照。
      canonical: cloneContent(content),
      activeBatchId: null,
      batches: { ...prev.batches, [batch.id]: updatedBatch },
      snapshots: [...prev.snapshots, snapshot],
      log: [
        {
          opId: `op-pub-${batch.id}-${now}`,
          batchId: batch.id,
          source: opts.by,
          ts: now,
          online: prev.online,
          kind: 'publish',
          detail: opts.force ? `强制发布 v${version}` : `发布 v${version}`,
          outcome,
        },
        ...prev.log,
      ],
    },
    outcome,
    snapshot,
  }
}

// ===========================================================================
// 8) 演示场景：双端离线修改 + 同字段冲突（供发布台一键载入）
// ===========================================================================

export function loadDemoScenario(
  prev: StudioState,
  seriesId: string,
  memberIds: string[],
  now: number,
): StudioState {
  let s = initState(prev.canonical)
  s = { ...s, role: prev.role }
  const frozen = freezeBaseline(s, seriesId, now)
  s = frozen.state
  s = { ...s, online: false }
  const batchId = frozen.batchId

  memberIds.forEach((id, i) => {
    s = submitOp(s, {
      opId: `demo-${batchId}-crop-${i + 1}`,
      batchId,
      source: 'lead',
      ts: now + i + 1,
      online: false,
      kind: 'set-crop',
      entityId: id,
      value: { x: 0.06, y: 0.08, w: 0.74, h: 0.8 },
    }).state
  })

  const lastId = memberIds[memberIds.length - 1]
  s = submitOp(s, {
    opId: `demo-${batchId}-lead-caption`,
    batchId,
    source: 'lead',
    ts: now + 100,
    online: false,
    kind: 'set-field',
    entity: 'photo',
    entityId: lastId,
    field: 'caption',
    value: '主策展人离线拟的结尾句：种子落进土里就不再需要名字。',
  }).state
  s = submitOp(s, {
    opId: `demo-${batchId}-collab-caption`,
    batchId,
    source: 'collaborator',
    ts: now + 101,
    online: false,
    kind: 'set-field',
    entity: 'photo',
    entityId: lastId,
    field: 'caption',
    value: '协作者离线拟的结尾句：草原收下了所有脚印。',
  }).state
  s = { ...s, online: true }
  return s
}
