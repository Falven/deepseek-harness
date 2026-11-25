/** Root/subcall Tool composition with one keyed atomic dispatch path. */
import { memo, useCallback, useMemo, type ReactNode } from 'react'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ToolCallOwnerProps, ToolCallPhaseProps, ToolTreeProps } from '../contract/slots.ts'
import { toolRowModel } from './models/tool-call-model.ts'
import { GenericToolCard } from './toolviews/GenericToolCard.tsx'
import css from './ToolCallTree.module.css'

function toolCallPhase(block: ToolCallBlock): ToolCallPhaseProps {
  if ('kind' in block) return { phase: 'result', block }
  return block.phase === 'preparing' ? { phase: 'preparing', block } : { phase: 'start', block }
}

/** Resolve a Tool call's wire name from its current stage. */
function callName(call: ToolCallPhaseProps): string {
  return call.phase === 'result' ? call.block.call?.name ?? '' : call.block.name
}

/** One atomic call dispatched through the Tool-owned keyed slot. */
const ToolCall = memo(function ToolCall({
  renderSlot, sessionId, callId, toolName, call, openFile, renderFallback, cwd, home, inspectCall, loadImage,
  useDisclosure, useJobs, watchJobs, observeJob, t, children,
}: Pick<ToolTreeProps, 'renderSlot' | 'sessionId' | 'openFile' | 'cwd' | 'inspectCall' | 'loadImage' | 'useDisclosure' | 'useJobs' | 'watchJobs' | 'observeJob' | 't'> & {
  renderFallback: (owner: ToolCallOwnerProps) => ReactNode
  callId: string
  toolName: string
  call: ToolCallPhaseProps
  home?: string | undefined
  children?: ReactNode
}) {
  const job = useJobs(state => call.phase === 'start'
    ? state.rows[sessionId]?.find(row => row.owner === sessionId && row.callId === callId)
    : undefined)
  const observation = useJobs(state => call.phase !== 'start' ? undefined
    : job === undefined
      ? Object.values(state.observed).find(row => row.owner === sessionId && row.callId === callId)
      : state.observed[job.id])
  const commandActivity = useMemo(() => call.phase === 'start'
    ? { watchJobs, observeJob, jobId: observation?.jobId ?? job?.id,
      cwd: observation?.cwd ?? job?.cwd, observation }
    : undefined, [call.phase, job, observation, watchJobs, observeJob])
  const owner: ToolCallOwnerProps = useMemo(() => ({
    callId,
    toolName,
    ...call,
    openFile,
    cwd,
    home,
    loadImage,
    useDisclosure,
    commandActivity,
    inspect: inspectCall === undefined ? undefined : () => { inspectCall(callId) },
  }), [callId, toolName, call, openFile, cwd, home, loadImage, inspectCall, useDisclosure, commandActivity])
  const autoReviewDenied = useMemo(
    () => call.phase === 'result' && toolRowModel(toolName, call.block).autoReviewDenial !== null,
    [toolName, call],
  )
  return (
    <div
      className={css.callRow}
      data-chat-anchor-key={`call:${callId}`}
      data-chat-call-id={callId}
    >
      {call.block.source && <div className={css.hostSource}>
        {call.block.source.name}{call.block.source.actor ? ` · ${call.block.source.actor.name}` : ''}
        {call.phase === 'result' && call.block.status && ` · ${t(`tool.hostStatus.${call.block.status}`)}`}
      </div>}
      {autoReviewDenied
        ? renderFallback(owner)
        : renderSlot('tool.call.toolview', owner, {
          entryKey: toolName,
          fallback: renderFallback(owner),
        })}
      {children}
    </div>
  )
})

const ToolCallBranch = memo(function ToolCallBranch({
  renderSlot, sessionId, block, cwd, home, openFile, renderFallback,
  inspectCall, loadImage, useDisclosure, useJobs, watchJobs, observeJob, t,
}: Pick<ToolTreeProps,
  'renderSlot' | 'sessionId' | 'cwd' | 'openFile' | 'inspectCall' | 'loadImage' |
  'useDisclosure' | 'useJobs' | 'watchJobs' | 'observeJob' | 't'
> & {
  renderFallback: (owner: ToolCallOwnerProps) => ReactNode
  block: ToolCallBlock
  home?: string | undefined
}) {
  const call = useMemo(() => toolCallPhase(block), [block])
  return (
    <ToolCall
      renderSlot={renderSlot}
      sessionId={sessionId}
      callId={call.block.callId}
      toolName={callName(call)}
      call={call}
      openFile={openFile}
      renderFallback={renderFallback}
      cwd={cwd}
      home={home}
      inspectCall={inspectCall}
      useDisclosure={useDisclosure}
      t={t}
      useJobs={useJobs}
      watchJobs={watchJobs}
      observeJob={observeJob}
      loadImage={loadImage}
    >
      {call.phase !== 'preparing' && call.block.subCalls.length > 0 ? (
        <div className={css.subCalls} data-subcalls>
          {call.block.subCalls.map(child => (
            <ToolCallBranch
              key={child.callId}
              renderSlot={renderSlot}
              sessionId={sessionId}
              block={child}
              cwd={cwd}
              home={home}
              openFile={openFile}
              renderFallback={renderFallback}
              inspectCall={inspectCall}
              useDisclosure={useDisclosure}
              t={t}
              useJobs={useJobs}
              watchJobs={watchJobs}
              observeJob={observeJob}
              loadImage={loadImage}
            />
          ))}
        </div>
      ) : null}
    </ToolCall>
  )
})

/**
 * Render one root Tool call and its recursive children through the same
 * atomic keyed dispatch.
 * @param props - whole-Tool owner data and the Tool-owned child-slot share.
 * @returns the Tool call tree.
 */
export function ToolCallTree({
  renderSlot, node, cwd, openFile, inspectCall, loadImage, useDisclosure, useHostInfo, useJobs, watchJobs, observeJob,
  t, useContextMenu, sessionId, resolveFilePath,
}: ToolTreeProps) {
  const { getTriggerProps } = useContextMenu()
  const getFileTriggerProps = useCallback((path: string) => getTriggerProps(() => ({
    kind: 'file', value: { sessionId, path: resolveFilePath(path) },
  })), [getTriggerProps, sessionId, resolveFilePath])
  const renderFallback = useCallback((owner: ToolCallOwnerProps) =>
    <GenericToolCard {...owner} t={t} getFileTriggerProps={getFileTriggerProps} />, [t, getFileTriggerProps])
  const home = useHostInfo(info => info.home)
  return (
    <ToolCallBranch
      renderSlot={renderSlot}
      sessionId={sessionId}
      block={node.data.root}
      cwd={cwd}
      home={home}
      openFile={openFile}
      renderFallback={renderFallback}
      inspectCall={inspectCall}
      useDisclosure={useDisclosure}
      t={t}
      useJobs={useJobs}
      watchJobs={watchJobs}
      observeJob={observeJob}
      loadImage={loadImage}
    />
  )
}
