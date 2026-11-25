import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SidebarRightGuideBox } from '../../tab-registry.ts'

/**
 * Observe the guide entries visible in one Session through the slot's bound hook.
 * @param source - registered guide entries in global order.
 * @param sessionId - Session whose visibility sources are read.
 * @returns the current visible entries, updated while a guide is subscribed.
 */
export function createVisibleGuideEntries(
  source: ObservableSnapshot<readonly SidebarRightGuideBox[]>, sessionId: SessionId,
): ObservableSnapshot<readonly SidebarRightGuideBox[]> {
  let entries = source.getSnapshot()
  let visibility = entries.map(entry => entry.visible?.(sessionId))
  const selected = () => entries.filter((_, index) => visibility[index]?.getSnapshot() !== false)
  const store = createSnapshotStore<readonly SidebarRightGuideBox[]>(selected())
  let subscribers = 0
  let stopRegistry: (() => void) | undefined
  let stopVisibility: readonly (() => void)[] = []
  const publish = () => {
    const next = selected()
    const previous = store.getSnapshot()
    if (next.length !== previous.length || next.some((entry, index) => entry !== previous[index])) store.set(next)
  }
  const rebind = () => {
    for (const stop of stopVisibility) stop()
    entries = source.getSnapshot()
    visibility = entries.map(entry => entry.visible?.(sessionId))
    stopVisibility = visibility.flatMap(source => source === undefined ? [] : [source.subscribe(publish)])
    publish()
  }
  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe(listener) {
      const stopStore = store.subscribe(listener)
      subscribers += 1
      if (subscribers === 1) {
        stopRegistry = source.subscribe(rebind)
        rebind()
      }
      return () => {
        stopStore()
        subscribers -= 1
        if (subscribers === 0) {
          stopRegistry?.()
          for (const stop of stopVisibility) stop()
          stopVisibility = []
        }
      }
    },
  }
}
