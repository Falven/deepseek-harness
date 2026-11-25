/** Exercise real feedback and Host Tool services before the SDK closes the recorded root turn. */
export const name = 'snapshot-feedback-producer'
export const inject = ['commands', 'messageFeedback', 'sessionFeedback', 'tools']

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - Composed runtime services.
 */
export function apply(ctx) {
  ctx.on('agent/turn-stopping', async ({ agent, signal }) => {
    if (agent.session.header.parentSession !== undefined) return
    const messages = agent.session.deriveMessages()
    const message = messages.findLast(message => message.role === 'assistant')
    if (message === undefined) throw new Error('feedback snapshot requires an assistant message')
    const command = await ctx.commands.execute(agent, '/feedback The session needs a clearer explanation.', [], signal)
    if (command?.result.kind !== 'success') throw new Error('feedback command did not succeed')
    const recorded = await ctx.sessionFeedback.record({ sessionId: agent.id, category: 'other' })
    if (!recorded.ok) throw new Error(recorded.error.code)
    const target = { sessionId: agent.id, messageId: message.id }
    const created = await ctx.messageFeedback.put({ ...target, rating: 'negative', note: 'Explain the result.', category: 'task-result', ifVersion: null })
    if (!created.ok) throw new Error(created.error.code)
    const edited = await ctx.messageFeedback.put({ ...target, rating: 'positive', note: 'The explanation is clear now.', ifVersion: created.value.version })
    if (!edited.ok) throw new Error(edited.error.code)
    const deleted = await ctx.messageFeedback.delete({ ...target, ifVersion: edited.value.version })
    if (!deleted.ok) throw new Error(deleted.error.code)
    const definition = {
      name: 'snapshot_host_action', description: 'SDK host-only operation.',
      parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
        presentationMeta: () => ({ receipt: 'saved' }),
      },
      async execute(args) { return args.text },
    }
    const receipt = await ctx.tools.startHostCall(agent.session, {
      callId: 'sdk-host-receipt', definition, arguments: { text: 'host action complete' },
      source: { name: 'SDK snapshot', actor: { id: 'snapshot-actor', name: 'Snapshot actor' }, meta: { origin: 'host' } },
    })
    const outcome = await receipt.completion
    if (outcome.status !== 'completed' || ctx.tools.schemas().some(tool => tool.name === definition.name)) {
      throw new Error('SDK host-only operation did not complete outside model discovery')
    }
    if (JSON.stringify(agent.session.deriveMessages()) !== JSON.stringify(messages)) {
      throw new Error('feedback or Host Tool changed model-visible messages')
    }
  })
}
