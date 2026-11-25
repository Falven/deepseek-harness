import { Context } from '@deepseek-ai/cordis'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { HostActorId } from '@deepseek-ai/dsh-session/types'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { expect, it, vi } from 'vitest'

it('records a host call once through native policy without model history or tool discovery', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  ctx.on('session/flush', () => {})
  const session = ctx.sessions.create(SessionId('host-call'))
  const released = Promise.withResolvers<string>()
  const started = Promise.withResolvers<undefined>()
  let invocations = 0
  let policies = 0
  ctx.on('tools/pre-execute', async (_exec, next) => { policies++; return next() })
  const definition = { ...defineTool({
    name: 'app_only', description: 'App operation', parameters: { value: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      invocations++
      expect(args).toEqual({ value: 'exact arguments' })
      started.resolve(undefined)
      return released.promise
    },
  }), finalizeMeta: () => ({ privateResult: 'retained' }) }
  const call = {
    callId: ToolCallId('action'), definition, arguments: { value: 'exact arguments' },
    source: { name: 'App', actor: { id: HostActorId('alice'), name: 'Alice' } },
  }
  try {
    const accepted = await ctx.tools.startHostCall(session, call)
    await started.promise
    expect(session.snapshotEvents().map(event => event.type)).toEqual(['tool/host-call', 'tool/host-dispatch'])
    expect(session.deriveMessages()).toEqual([])
    expect(ctx.tools.schemas().some(tool => tool.name === 'app_only')).toBe(false)
    const duplicate = await ctx.tools.startHostCall(session, call)
    released.resolve('complete result')
    await accepted.completion
    await duplicate.completion
    const events = session.snapshotEvents()
    expect(events.at(-1)).toMatchObject({ type: 'tool/host-result', data: {
      callId: 'action', status: 'completed', content: [{ type: 'text', text: 'complete result' }], value: 'complete result',
      meta: { privateResult: 'retained' },
    } })
    expect(events[0]).toMatchObject({ data: { arguments: { value: 'exact arguments' }, source: call.source } })
    expect(session.deriveMessages()).toEqual([])
    expect(invocations).toBe(1)
    expect(policies).toBe(1)
    await (await ctx.tools.startHostCall(session, call)).completion
    expect(invocations).toBe(1)
  } finally {
    released.resolve('complete result')
    await ctx.fiber.dispose()
  }
})

it('serializes exclusive Host calls and records policy rejection without dispatch', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  ctx.on('session/flush', () => {})
  const session = ctx.sessions.create(SessionId('host-queue'))
  const release = Promise.withResolvers<string>()
  const started = Promise.withResolvers<undefined>()
  const bodies: string[] = []
  const definition = defineTool({ name: 'action', description: 'Action', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(_args, exec) { bodies.push(String(exec.callId)); started.resolve(undefined); return release.promise },
  })
  ctx.on('tools/pre-execute', async (exec, next) => exec.callId === 'denied'
    ? { kind: 'deny', reason: 'Viewer is not allowed.' } : next())
  try {
    const first = await ctx.tools.startHostCall(session, { callId: ToolCallId('alice'), definition, arguments: {}, source: { name: 'App', actor: { id: HostActorId('a'), name: 'Alice' } } })
    await started.promise
    const second = await ctx.tools.startHostCall(session, { callId: ToolCallId('denied'), definition, arguments: {}, source: { name: 'App', actor: { id: HostActorId('b'), name: 'Bob' } } })
    expect(bodies).toEqual(['alice'])
    expect(session.snapshotEvents().filter(event => event.type === 'tool/host-call')).toHaveLength(2)
    release.resolve('saved')
    await first.completion
    expect(await second.completion).toMatchObject({ status: 'not-dispatched', isError: true, source: { actor: { name: 'Bob' } } })
    expect(bodies).toEqual(['alice'])
    expect(session.deriveMessages()).toEqual([])
    await expect(ctx.tools.startHostCall(session, { callId: ToolCallId('alice'), definition, arguments: { different: true }, source: { name: 'App' } })).rejects.toThrow('different invocation')
  } finally { release.resolve('saved'); await ctx.fiber.dispose() }
})

it('forks exact Host call prefixes without transferring live work or letting an observer cancel it', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  ctx.on('session/flush', () => {})
  const source = ctx.sessions.create(SessionId('host-fork-source'))
  source.append('turn/start', { turn: 1 })
  source.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'Original request' }], source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  source.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const history = source.deriveMessages()
  const before = ctx.sessions.fork(source, undefined, SessionId('before-host-call'))
  const beforeEvents = before.snapshotEvents()
  const admitted = Promise.withResolvers<undefined>()
  const allow = Promise.withResolvers<undefined>()
  const entered = Promise.withResolvers<AbortSignal>()
  const release = Promise.withResolvers<string>()
  let executions = 0
  const definition = defineTool({ name: 'action', description: 'Action', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(_args, exec) {
      executions++
      entered.resolve(exec.signal)
      return release.promise
    },
  })
  const call = {
    callId: ToolCallId('forked-action'), definition, arguments: {},
    source: { name: 'App', actor: { id: HostActorId('alice'), name: 'Alice' } },
  }
  ctx.on('tools/pre-execute', async (_exec, next) => {
    admitted.resolve(undefined)
    await allow.promise
    return next()
  })
  try {
    const accepted = await ctx.tools.startHostCall(source, call)
    await admitted.promise
    const acceptedPrefix = source.snapshotEvents()
    const pending = ctx.sessions.fork(source, undefined, SessionId('accepted-host-call'))
    expect(pending.snapshotEvents().slice(0, pending.inheritedEventCount)).toEqual(acceptedPrefix)
    expect(pending.snapshotEvents().at(-1)).toMatchObject({ type: 'tool/host-result', data: {
      callId: call.callId, status: 'unknown', arguments: {}, source: call.source,
    } })
    expect(pending.snapshotEvents().some(event => event.type === 'tool/host-dispatch')).toBe(false)
    const pendingEvents = pending.snapshotEvents()

    allow.resolve(undefined)
    const signal = await entered.promise
    const dispatchedPrefix = source.snapshotEvents()
    const during = ctx.sessions.fork(source, undefined, SessionId('dispatched-host-call'))
    expect(during.snapshotEvents().slice(0, during.inheritedEventCount)).toEqual(dispatchedPrefix)
    expect(during.snapshotEvents().at(-1)).toMatchObject({ type: 'tool/host-result', data: {
      callId: call.callId, status: 'unknown', arguments: {}, source: call.source,
    } })
    const duringEvents = during.snapshotEvents()
    const observed = Promise.withResolvers<Awaited<ReturnType<ToolRuntime['startHostCall']>>>()
    const observer = await ctx.plugin(Object.assign(async (inner: Context) => {
      observed.resolve(await inner.tools.startHostCall(source, call))
    }, { inject: ['tools'] }))
    const duplicate = await observed.promise
    await observer.dispose()
    expect(signal.aborted).toBe(false)
    expect(source.snapshotEvents()).toEqual(dispatchedPrefix)

    release.resolve('source completed')
    const result = await accepted.completion
    expect(await duplicate.completion).toEqual(result)
    expect(result).toMatchObject({ status: 'completed', value: 'source completed' })
    const after = ctx.sessions.fork(source, undefined, SessionId('completed-host-call'))
    expect(after.snapshotEvents().slice(0, after.inheritedEventCount)).toEqual(source.snapshotEvents())
    for (const [child, status] of [[pending, 'unknown'], [during, 'unknown'], [after, 'completed']] as const) {
      expect(await (await ctx.tools.startHostCall(child, call)).completion).toMatchObject({ status })
      expect(child.deriveMessages()).toEqual(history)
    }
    expect(before.snapshotEvents()).toEqual(beforeEvents)
    expect(pending.snapshotEvents()).toEqual(pendingEvents)
    expect(during.snapshotEvents()).toEqual(duringEvents)
    expect(source.deriveMessages()).toEqual(history)
    expect(executions).toBe(1)
  } finally {
    allow.resolve(undefined)
    release.resolve('source completed')
    await ctx.fiber.dispose()
  }
})

it.each(['missing', 'rejected'] as const)('settles an undispatched Host call when its acceptance checkpoint is %s', async (kind) => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const session = ctx.sessions.create(SessionId(`host-checkpoint-${kind}`))
  let flushes = 0
  const failure = new Error('Session storage is unavailable')
  if (kind === 'rejected') {
    ctx.on('session/flush', () => {
      flushes++
      if (flushes === 1) throw failure
    })
  }
  const execute = vi.fn(async () => 'saved')
  const definition = defineTool({ name: 'action', description: 'Action', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute,
  })
  const call = { callId: ToolCallId('checkpoint'), definition, arguments: {}, source: { name: 'App' } }
  try {
    await expect(ctx.tools.startHostCall(session, call)).rejects.toThrow(kind === 'missing'
      ? 'Host Tool calls require native Session persistence' : failure.message)
    await vi.waitFor(() => {
      expect(session.snapshotEvents().map(event => event.type)).toEqual(['tool/host-call', 'tool/host-result'])
    })
    expect(session.snapshotEvents().at(-1)).toMatchObject({ data: { callId: 'checkpoint', status: 'not-dispatched', isError: true } })
    expect(execute).not.toHaveBeenCalled()
    if (kind === 'rejected') {
      expect(flushes).toBe(2)
      expect(await (await ctx.tools.startHostCall(session, call)).completion).toMatchObject({ status: 'not-dispatched' })
      expect(execute).not.toHaveBeenCalled()
    }
  } finally { await ctx.fiber.dispose() }
})

it.each(['body', 'post-execute'] as const)('records an unknown Host outcome when its owner is disposed during %s', async (phase) => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  ctx.on('session/flush', () => {})
  const session = ctx.sessions.create(SessionId(`host-aborted-${phase}`))
  const entered = Promise.withResolvers<undefined>()
  const definition = defineTool({ name: 'action', description: 'Action', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(_args, exec) {
      if (phase === 'body') {
        entered.resolve(undefined)
        await new Promise<void>((resolve) => {
          exec.signal.addEventListener('abort', () => { resolve() }, { once: true })
        })
      }
      return 'mutation completed'
    },
  })
  ctx.on('tools/post-execute', async (exec, _result, next) => {
    const decision = await next()
    if (phase === 'post-execute') {
      entered.resolve(undefined)
      await new Promise<void>((resolve) => {
        exec.signal.addEventListener('abort', () => { resolve() }, { once: true })
      })
    }
    return decision
  })
  try {
    const admitted = Promise.withResolvers<Awaited<ReturnType<ToolRuntime['startHostCall']>>>()
    const owner = await ctx.plugin(Object.assign(async (inner: Context) => {
      admitted.resolve(await inner.tools.startHostCall(session, {
        callId: ToolCallId('aborted'), definition, arguments: {}, source: { name: 'App' },
      }))
    }, { inject: ['tools'] }))
    const accepted = await admitted.promise
    await entered.promise
    await owner.dispose()
    expect(await accepted.completion).toMatchObject({ status: 'unknown', isError: true, error: { code: 'ABORTED' } })
    expect(session.snapshotEvents().map(event => event.type)).toEqual(['tool/host-call', 'tool/host-dispatch', 'tool/host-result'])
    expect(session.snapshotEvents().at(-1)).toMatchObject({ data: { status: 'unknown' } })
    expect(session.deriveMessages()).toEqual([])
  } finally { await ctx.fiber.dispose() }
})
