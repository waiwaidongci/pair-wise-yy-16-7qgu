import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import type {
  ConsoleState,
  Role,
  Source,
  OpType,
  Operation,
  Batch,
  Baseline,
  Snapshot,
} from './types'
import {
  buildBaseline,
  liveContent,
  mergeOps,
  pendingConflicts,
  allCropped,
  uncroppedPhotos,
  makeDerived,
} from './consoleMachine'

const STORAGE_KEY = 'portfolio:console-state-v1'

type PersistedState = Omit<ConsoleState, 'notice'>

function initialState(): ConsoleState {
  const empty: ConsoleState = {
    role: 'chief',
    online: false,
    batches: [],
    snapshots: [],
    baselines: {},
    currentBatchId: null,
    opSeq: 0,
    baselineSeq: 0,
    batchSeq: 0,
    snapshotSeq: 0,
    conflictSeq: 0,
    idempotency: {},
    notice: null,
  }
  if (typeof window === 'undefined') return empty
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as PersistedState
    return { ...empty, ...parsed, notice: null }
  } catch {
    return empty
  }
}

type Action =
  | { type: 'SET_ROLE'; role: Role }
  | { type: 'SET_ONLINE'; online: boolean }
  | { type: 'CREATE_BATCH' }
  | { type: 'SELECT_BATCH'; id: string }
  | {
      type: 'ADD_OP'
      source: Source
      opType: OpType
      photoId: string
      field: string
      oldValue: string
      newValue: string
    }
  | { type: 'RETRY_OP'; opNo: string }
  | { type: 'MERGE' }
  | { type: 'ADJUDICATE'; conflictId: string; source: Source }
  | { type: 'CROP'; photoId: string; ratio: string }
  | { type: 'PUBLISH'; force: boolean }
  | { type: 'RECOMPUTE' }
  | { type: 'REFREEZE_BASELINE' }
  | { type: 'NEW_BATCH_FROM_SNAPSHOT'; snapshotId: string }
  | { type: 'SNAPSHOT_WRITE_GUARD'; snapshotId: string }
  | { type: 'DISMISS_NOTICE' }

// 构造下一个基线：默认从 photos.json；若已有线上快照，则冻结「当前线上内容」
function nextBaseline(state: ConsoleState, frozenAt: number): Baseline {
  const id = `BL-${String(state.baselineSeq + 1).padStart(3, '0')}`
  const baseline = buildBaseline(id, frozenAt)
  const live = liveContent(state.snapshots)
  if (live) baseline.photos = JSON.parse(JSON.stringify(live))
  return baseline
}

function reducer(state: ConsoleState, action: Action): ConsoleState {
  switch (action.type) {
    case 'SET_ROLE':
      return { ...state, role: action.role }

    case 'SET_ONLINE':
      return { ...state, online: action.online, notice: null }

    case 'CREATE_BATCH': {
      const now = Date.now()
      const baseline = nextBaseline(state, now)
      const batchId = `B-${String(state.batchSeq + 1).padStart(3, '0')}`
      const batch: Batch = {
        id: batchId,
        baselineId: baseline.id,
        status: 'editing',
        ops: [],
        conflicts: [],
        derived: null,
        crops: JSON.parse(JSON.stringify(baseline.crops)),
        snapshotId: null,
        createdAt: now,
      }
      return {
        ...state,
        baselineSeq: state.baselineSeq + 1,
        batchSeq: state.batchSeq + 1,
        baselines: { ...state.baselines, [baseline.id]: baseline },
        batches: [...state.batches, batch],
        currentBatchId: batch.id,
        notice: { kind: 'success', text: `已冻结基线 ${baseline.id}，创建批次 ${batchId}` },
      }
    }

    case 'SELECT_BATCH':
      return { ...state, currentBatchId: action.id, notice: null }

    case 'ADD_OP': {
      if (state.online) {
        return {
          ...state,
          notice: { kind: 'error', text: '在线状态下不可记录离线操作。请先「断网」再调整封面、顺序或说明。' },
        }
      }
      const batch = state.batches.find(b => b.id === state.currentBatchId)
      if (!batch) {
        return { ...state, notice: { kind: 'error', text: '请先创建或选择一个发布批次。' } }
      }
      const opNo = `OP-${String(state.opSeq + 1).padStart(4, '0')}`
      const op: Operation = {
        opNo,
        source: action.source,
        batchId: batch.id,
        baseBaselineId: batch.baselineId,
        type: action.opType,
        photoId: action.photoId,
        field: action.field,
        oldValue: action.oldValue,
        newValue: action.newValue,
        at: Date.now(),
      }
      const batches = state.batches.map(b =>
        b.id === batch.id
          ? {
              ...b,
              ops: [...b.ops, op],
              // 任何新增操作都会改变哈希 → 未发布派生结果失效
              derived: b.derived ? { ...b.derived, valid: false } : null,
            }
          : b,
      )
      return {
        ...state,
        opSeq: state.opSeq + 1,
        batches,
        idempotency: {
          ...state.idempotency,
          [opNo]: { resultId: opNo, at: op.at },
        },
        notice: {
          kind: 'info',
          text: `已记录离线操作 ${opNo}（来源：${action.source === 'curator' ? '策展人' : '另一位编辑'}）`,
        },
      }
    }

    case 'RETRY_OP': {
      const first = state.idempotency[action.opNo]
      if (!first) {
        return { ...state, notice: { kind: 'error', text: `未找到操作 ${action.opNo} 的首次结果。` } }
      }
      // 幂等：重复重试沿用首次结果，不产生新操作
      return {
        ...state,
        notice: {
          kind: 'info',
          text: `操作 ${action.opNo} 已提交，沿用首次结果（首次结果ID：${first.resultId}），不重复写入。`,
        },
      }
    }

    case 'MERGE': {
      if (!state.online) {
        return { ...state, notice: { kind: 'error', text: '请先「恢复在线」再执行逐字段合并。' } }
      }
      const batch = state.batches.find(b => b.id === state.currentBatchId)
      if (!batch) {
        return { ...state, notice: { kind: 'error', text: '请先选择一个发布批次。' } }
      }
      const baseline = state.baselines[batch.baselineId] ?? buildBaseline(batch.baselineId, batch.createdAt)
      const { conflicts } = mergeOps(baseline, batch.ops, state.conflictSeq)
      const derived = makeDerived(baseline, batch.ops, conflicts)
      const pending = pendingConflicts(conflicts)
      const batches = state.batches.map(b =>
        b.id === batch.id ? { ...b, status: 'merged' as const, conflicts, derived } : b,
      )
      return {
        ...state,
        batches,
        conflictSeq: state.conflictSeq + conflicts.length,
        notice: {
          kind: pending > 0 ? 'info' : 'success',
          text: `逐字段合并完成：${Object.keys(derived.content).length} 张照片已派生，${conflicts.length} 项冲突（${pending} 项待裁决）。`,
        },
      }
    }

    case 'ADJUDICATE': {
      const batch = state.batches.find(b => b.id === state.currentBatchId)
      if (!batch) return state
      const baseline = state.baselines[batch.baselineId] ?? buildBaseline(batch.baselineId, batch.createdAt)
      const conflicts = batch.conflicts.map(c =>
        c.id === action.conflictId
          ? { ...c, status: 'adjudicated' as const, chosenSource: action.source }
          : c,
      )
      const derived = makeDerived(baseline, batch.ops, conflicts)
      const batches = state.batches.map(b => (b.id === batch.id ? { ...b, conflicts, derived } : b))
      return {
        ...state,
        batches,
        notice: {
          kind: 'success',
          text: `冲突 ${action.conflictId} 已裁决，采用${action.source === 'curator' ? '策展人' : '另一位编辑'}版本。`,
        },
      }
    }

    case 'CROP': {
      const batch = state.batches.find(b => b.id === state.currentBatchId)
      if (!batch) return state
      const crops = { ...batch.crops, [action.photoId]: { cropped: true, ratio: action.ratio } }
      const batches = state.batches.map(b => (b.id === batch.id ? { ...b, crops } : b))
      const left = uncroppedPhotos(crops).length
      return {
        ...state,
        batches,
        notice: {
          kind: left === 0 ? 'success' : 'info',
          text: left === 0 ? '全部照片已裁完，可以发布。' : `已裁 ${action.photoId}，还剩 ${left} 张未裁。`,
        },
      }
    }

    case 'PUBLISH': {
      const batch = state.batches.find(b => b.id === state.currentBatchId)
      if (!batch) return state
      // 角色守卫：协作者 → 403
      if (state.role !== 'chief') {
        return {
          ...state,
          notice: { kind: 'error', text: '403 Forbidden：协作者无权发布。仅主策展人可发布或强制发布。' },
        }
      }
      if (batch.status === 'published') {
        return { ...state, notice: { kind: 'error', text: '该批次已发布，不能重复发布。' } }
      }
      if (!batch.derived) {
        return { ...state, notice: { kind: 'error', text: '尚未合并派生结果，请先「逐字段合并」。' } }
      }
      const pending = pendingConflicts(batch.conflicts)
      const cropped = allCropped(batch.crops)
      if (!cropped) {
        return {
          ...state,
          notice: { kind: 'error', text: `未裁完不能发布：还有 ${uncroppedPhotos(batch.crops).length} 张照片未裁图。` },
        }
      }
      if (!action.force && pending > 0) {
        return {
          ...state,
          notice: { kind: 'error', text: `还有 ${pending} 项冲突待裁决，不能发布。主策展人可「强制发布」跳过裁决。` },
        }
      }
      const snapshotId = `SN-${String(state.snapshotSeq + 1).padStart(3, '0')}`
      const snapshot: Snapshot = {
        id: snapshotId,
        batchId: batch.id,
        baselineId: batch.baselineId,
        publishedAt: Date.now(),
        publishedBy: state.role,
        content: JSON.parse(JSON.stringify(batch.derived.content)),
        crops: JSON.parse(JSON.stringify(batch.crops)),
      }
      const batches = state.batches.map(b =>
        b.id === batch.id ? { ...b, status: 'published' as const, snapshotId: snapshot.id } : b,
      )
      return {
        ...state,
        batches,
        snapshots: [...state.snapshots, snapshot],
        snapshotSeq: state.snapshotSeq + 1,
        notice: {
          kind: 'success',
          text: action.force
            ? `强制发布成功：已生成不可变快照 ${snapshotId}（跳过 ${pending} 项冲突裁决，由主策展人负责；裁图门槛仍生效）。`
            : `发布成功：已生成不可变快照 ${snapshotId}。`,
        },
      }
    }

    case 'RECOMPUTE': {
      const batch = state.batches.find(b => b.id === state.currentBatchId)
      if (!batch || !batch.derived) return state
      if (batch.derived.valid) {
        return { ...state, notice: { kind: 'info', text: '派生结果仍然有效，无需重算。' } }
      }
      const baseline = state.baselines[batch.baselineId] ?? buildBaseline(batch.baselineId, batch.createdAt)
      const derived = makeDerived(baseline, batch.ops, batch.conflicts)
      const batches = state.batches.map(b => (b.id === batch.id ? { ...b, derived } : b))
      return {
        ...state,
        batches,
        notice: { kind: 'success', text: `已按最新基线与操作重算派生结果（hash ${derived.hash}）。` },
      }
    }

    case 'REFREEZE_BASELINE': {
      const batch = state.batches.find(b => b.id === state.currentBatchId)
      if (!batch) return state
      const now = Date.now()
      const baseline = nextBaseline(state, now)
      // 重新冻结基线 → 未发布派生结果失效
      const batches = state.batches.map(b =>
        b.id === batch.id
          ? { ...b, baselineId: baseline.id, derived: b.derived ? { ...b.derived, valid: false } : null }
          : b,
      )
      return {
        ...state,
        baselineSeq: state.baselineSeq + 1,
        baselines: { ...state.baselines, [baseline.id]: baseline },
        batches,
        notice: { kind: 'info', text: `已重新冻结基线 ${baseline.id}，未发布派生结果失效，请重算。` },
      }
    }

    case 'NEW_BATCH_FROM_SNAPSHOT': {
      const snapshot = state.snapshots.find(s => s.id === action.snapshotId)
      if (!snapshot) return state
      const now = Date.now()
      const baseline = nextBaseline(state, now)
      // 新基线冻结自快照内容，但绝不回写快照本身
      baseline.photos = JSON.parse(JSON.stringify(snapshot.content))
      const batchId = `B-${String(state.batchSeq + 1).padStart(3, '0')}`
      const batch: Batch = {
        id: batchId,
        baselineId: baseline.id,
        status: 'editing',
        ops: [],
        conflicts: [],
        derived: null,
        crops: JSON.parse(JSON.stringify(snapshot.crops)),
        snapshotId: null,
        createdAt: now,
      }
      return {
        ...state,
        baselineSeq: state.baselineSeq + 1,
        batchSeq: state.batchSeq + 1,
        baselines: { ...state.baselines, [baseline.id]: baseline },
        batches: [...state.batches, batch],
        currentBatchId: batch.id,
        notice: { kind: 'success', text: `已从快照 ${snapshot.id} 新建草稿批次 ${batchId}（快照本身保持不可变）。` },
      }
    }

    case 'SNAPSHOT_WRITE_GUARD': {
      const snapshot = state.snapshots.find(s => s.id === action.snapshotId)
      if (!snapshot) return state
      // 已发布快照不可被新草稿回写 —— 守卫拦截
      return {
        ...state,
        notice: {
          kind: 'error',
          text: `拦截：已发布快照 ${snapshot.id} 不可被新草稿回写。快照内容已冻结，如需修改请新建草稿批次。`,
        },
      }
    }

    case 'DISMISS_NOTICE':
      return { ...state, notice: null }

    default:
      return state
  }
}

type ConsoleContextType = {
  state: ConsoleState
  setRole: (r: Role) => void
  setOnline: (b: boolean) => void
  createBatch: () => void
  selectBatch: (id: string) => void
  addOp: (
    source: Source,
    opType: OpType,
    photoId: string,
    field: string,
    oldValue: string,
    newValue: string,
  ) => void
  retryOp: (opNo: string) => void
  merge: () => void
  adjudicate: (conflictId: string, source: Source) => void
  crop: (photoId: string, ratio: string) => void
  publish: (force: boolean) => void
  recompute: () => void
  refreezeBaseline: () => void
  newBatchFromSnapshot: (snapshotId: string) => void
  attemptSnapshotWrite: (snapshotId: string) => void
  dismissNotice: () => void
}

const ConsoleContext = createContext<ConsoleContextType | null>(null)

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  useEffect(() => {
    try {
      const { notice: _notice, ...persist } = state
      void _notice
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persist))
    } catch {
      // 持久化失败可忽略
    }
  }, [state])

  const value: ConsoleContextType = {
    state,
    setRole: useCallback((r: Role) => dispatch({ type: 'SET_ROLE', role: r }), []),
    setOnline: useCallback((b: boolean) => dispatch({ type: 'SET_ONLINE', online: b }), []),
    createBatch: useCallback(() => dispatch({ type: 'CREATE_BATCH' }), []),
    selectBatch: useCallback((id: string) => dispatch({ type: 'SELECT_BATCH', id }), []),
    addOp: useCallback(
      (source: Source, opType: OpType, photoId: string, field: string, oldValue: string, newValue: string) =>
        dispatch({ type: 'ADD_OP', source, opType, photoId, field, oldValue, newValue }),
      [],
    ),
    retryOp: useCallback((opNo: string) => dispatch({ type: 'RETRY_OP', opNo }), []),
    merge: useCallback(() => dispatch({ type: 'MERGE' }), []),
    adjudicate: useCallback(
      (conflictId: string, source: Source) => dispatch({ type: 'ADJUDICATE', conflictId, source }),
      [],
    ),
    crop: useCallback((photoId: string, ratio: string) => dispatch({ type: 'CROP', photoId, ratio }), []),
    publish: useCallback((force: boolean) => dispatch({ type: 'PUBLISH', force }), []),
    recompute: useCallback(() => dispatch({ type: 'RECOMPUTE' }), []),
    refreezeBaseline: useCallback(() => dispatch({ type: 'REFREEZE_BASELINE' }), []),
    newBatchFromSnapshot: useCallback(
      (snapshotId: string) => dispatch({ type: 'NEW_BATCH_FROM_SNAPSHOT', snapshotId }),
      [],
    ),
    attemptSnapshotWrite: useCallback(
      (snapshotId: string) => dispatch({ type: 'SNAPSHOT_WRITE_GUARD', snapshotId }),
      [],
    ),
    dismissNotice: useCallback(() => dispatch({ type: 'DISMISS_NOTICE' }), []),
  }

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
}

export function useConsole(): ConsoleContextType {
  const ctx = useContext(ConsoleContext)
  if (!ctx) throw new Error('useConsole 必须在 <ConsoleProvider> 内使用')
  return ctx
}

// 派生选择器：当前选中的批次
export function useCurrentBatch(): Batch | null {
  const { state } = useConsole()
  return state.batches.find(b => b.id === state.currentBatchId) ?? null
}
