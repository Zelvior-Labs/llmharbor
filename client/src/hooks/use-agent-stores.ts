import { useEffect, useSyncExternalStore } from 'react'
import { sharedWorkspace, type AgentWorkspace } from '@/lib/agent-workspace'
import { sharedKnowledge, type KnowledgeStore } from '@/lib/knowledge-store'

/** The page-wide agent workspace; re-renders on every change. */
export function useWorkspace(): AgentWorkspace {
  const ws = sharedWorkspace()
  useSyncExternalStore(l => ws.subscribe(l), () => ws.getVersion())
  useEffect(() => { void ws.ready() }, [ws])
  return ws
}

/** The page-wide knowledge store; re-renders on every change. */
export function useKnowledge(): KnowledgeStore {
  const store = sharedKnowledge()
  useSyncExternalStore(l => store.subscribe(l), () => store.getVersion())
  useEffect(() => { void store.ready() }, [store])
  return store
}
