/** Host invocation identities and outcomes reconstructed by the native Session projection drive. */
import type { HostToolCallData, HostToolResultData } from '@deepseek-ai/dsh-session/types'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'

interface HostCallRecord {
  call: HostToolCallData
  result?: HostToolResultData | undefined
}

/** Invocation receipts retained by the Host across Session reattachment. */
export type HostCallRecords = Record<string, HostCallRecord>

/** Complete receipts rebuilt on resume and advanced by accepted/settled events. */
export const hostToolCallsProjection: ProjectionDefinition<'hostToolCalls', HostCallRecords> = {
  key: 'hostToolCalls', stateVersion: 1,
  stateSchema: z.record(z.string(), z.object({ call: z.custom<HostToolCallData>(), result: z.custom<HostToolResultData>().optional() })),
  init: () => ({}),
  apply(state, event) {
    if (event.type === 'tool/host-call') return { ...state, [event.data.callId]: { call: event.data } }
    if (event.type !== 'tool/host-result') return state
    const { turn, callId, name, arguments: args, source } = event.data
    return { ...state, [callId]: { call: { turn, callId, name, arguments: args, source }, result: event.data } }
  },
}
