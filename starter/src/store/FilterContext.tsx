
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { CategoryId } from '../types'

export type FilterValue = CategoryId | 'all'
const STORAGE_KEY = 'portfolio:work-filter'

function readInitial(): FilterValue {
  if (typeof window === 'undefined') return 'all'
  const saved = window.sessionStorage.getItem(STORAGE_KEY)
  if (saved === 'all' || saved === 'portrait' || saved === 'landscape' || saved === 'pastoral') {
    return saved
  }
  return 'all'
}

// 筛选状态在导航间保持（约束 #1）：/work 选中分类后进入系列详情再返回，筛选仍保留。
// 用 sessionStorage 持久化，后退/前进或重新挂载都能恢复。
type FilterContextType = {
  category: FilterValue
  setCategory: (c: FilterValue) => void
}

const FilterContext = createContext<FilterContextType | null>(null)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [category, setCategoryState] = useState<FilterValue>(readInitial)

  const setCategory = useCallback((c: FilterValue) => {
    setCategoryState(c)
    window.sessionStorage.setItem(STORAGE_KEY, c)
  }, [])

  return (
    <FilterContext.Provider value={{ category, setCategory }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilter(): FilterContextType {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilter 必须在 <FilterProvider> 内使用')
  return ctx
}
