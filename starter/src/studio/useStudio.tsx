import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  initState,
  createInitialContent,
  setRole,
  setOnline,
  freezeBaseline,
  submitOp,
  sync,
  adjudicate,
  recomputeDerived,
  publish,
  loadDemoScenario,
  type StudioState,
  type Role,
  type Source,
  type Operation,
  type EditKind,
} from './engine'
import rawData from '../data/photos.json'
import type { PhotoData } from '../data/photos'

const STORAGE_KEY = 'studio-state-v1'
const data = rawData as PhotoData

/** 每个系列包含哪些照片（来自权威数据源，引擎按此判断"裁完没有"与派生顺序）。 */
export const MEMBERS_BY_SERIES: Record<string, string[]> = Object.fromEntries(
  data.series.map(s => [
    s.id,
    data.photos.filter(p => p.seriesId === s.id).map(p => p.id),
  ]),
)

function defaultState(): StudioState {
  return initState(createInitialContent(data))
}

function load(): StudioState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as StudioState
    if (!parsed.batches || !parsed.canonical) return defaultState()
    return parsed
  } catch {
    return defaultState()
  }
}

export type StudioAction =
  | { type: 'reset' }
  | { type: 'role'; role: Role }
  | { type: 'online'; online: boolean }
  | { type: 'freeze'; seriesId: string }
  | { type: 'op'; op: Operation }
  | { type: 'sync' }
  | { type: 'adjudicate'; key: string; choice: 'local' | 'remote' | 'custom'; by: Source; customValue?: string }
  | { type: 'recompute' }
  | { type: 'publish'; force: boolean; by: Role }
  | { type: 'demo'; seriesId: string }

function reducer(prev: StudioState, action: StudioAction): StudioState {
  const t = Date.now()
  switch (action.type) {
    case 'reset':
      return defaultState()
    case 'role':
      return setRole(prev, action.role)
    case 'online':
      return setOnline(prev, action.online)
    case 'freeze':
      return freezeBaseline(prev, action.seriesId, t).state
    case 'op':
      return submitOp(prev, action.op).state
    case 'sync':
      return sync(prev, t).state
    case 'adjudicate':
      return adjudicate(prev, action.key, action.choice, action.by, t, action.customValue).state
    case 'recompute':
      return recomputeDerived(prev, MEMBERS_BY_SERIES, t)
    case 'publish':
      return publish(prev, MEMBERS_BY_SERIES, { force: action.force, by: action.by }, t).state
    case 'demo':
      return loadDemoScenario(prev, action.seriesId, MEMBERS_BY_SERIES[action.seriesId] ?? [], t)
    default:
      return prev
  }
}

export interface StudioApi {
  state: StudioState
  dispatch: React.Dispatch<StudioAction>
  /** 构造一个带操作号的编辑动作 */
  makeEdit: (
    source: Source,
    edit: Omit<Operation, 'opId' | 'batchId' | 'source' | 'ts' | 'online' | 'kind'> & {
      kind: EditKind
    },
    opIdOverride?: string,
  ) => Operation
  lastToast: { kind: 'ok' | 'error'; text: string } | null
  clearToast: () => void
}

const StudioContext = createContext<StudioApi | null>(null)

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  // 操作号计数器：加载/冻结新基线后追及 state.seq，但绝不回退——
  // 否则同一事件循环里连续派发多个操作时会生成重复 opId。
  const seqRef = useRef(state.seq)
  if (seqRef.current < state.seq) seqRef.current = state.seq
  const prevFirstId = useRef<string | null>(state.log[0]?.opId ?? null)
  const [lastToast, setLastToast] = useState<StudioApi['lastToast']>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* 存储满或被禁用时忽略，不影响当前会话 */
    }
  }, [state])

  // 从日志最新条目提取提示（包括 403 / blocked / duplicate）
  useEffect(() => {
    const firstId = state.log[0]?.opId ?? null
    if (firstId !== prevFirstId.current) {
      prevFirstId.current = firstId
      const entry = state.log[0]
      if (entry) {
        const failed = entry.outcome.status === 'rejected' || entry.outcome.status === 'blocked'
        setLastToast({
          kind: failed ? 'error' : 'ok',
          text: `[${entry.outcome.status}${entry.outcome.code ? ` ${entry.outcome.code}` : ''}] ${entry.outcome.message}`,
        })
      }
    }
  }, [state.log])

  const makeEdit: StudioApi['makeEdit'] = (source, edit, opIdOverride) => {
    seqRef.current += 1
    return {
      opId:
        opIdOverride ??
        `op-${String(seqRef.current).padStart(4, '0')}-${Math.random().toString(36).slice(2, 8)}`,
      batchId: state.activeBatchId ?? '',
      source,
      ts: Date.now(),
      online: state.online,
      ...edit,
    }
  }

  return (
    <StudioContext.Provider value={{ state, dispatch, makeEdit, lastToast, clearToast: () => setLastToast(null) }}>
      {children}
    </StudioContext.Provider>
  )
}

export function useStudio(): StudioApi {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('useStudio 必须在 <StudioProvider> 内使用')
  return ctx
}
