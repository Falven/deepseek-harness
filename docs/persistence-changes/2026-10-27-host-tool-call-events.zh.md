---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-27-host-tool-call-events

[English](2026-10-27-host-tool-call-events.md) | 中文

## 概述

将 Host 所有的工具接纳、分发意图和最终结果记录为模型历史之外的会话事件。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-27-host-tool-call-events
baseline: false
changes:
  - root: "event:tool/host-call"
    previous: null
    after: "902dda657d0b6b186afef2288d0c6a19a567964db672c078b6e6e7606603f78e"
    decision: same-version
  - root: "event:tool/host-dispatch"
    previous: null
    after: "c60a4061bda3e09824f1fd55b4ad33ebb8b3a95ae6941b818e5ff3e8ca1ac61f"
    decision: same-version
  - root: "event:tool/host-result"
    previous: null
    after: "07121a0b7dd081db37a9c2279144ca2f2e228ef465a42f5b149b47509cf480b6"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

较早的会话读取器会在恢复日志前拒绝这些必需的未知事件类型。当前读取器保留较早的会话，并依据已记录的接纳与分发状态结算中断的 Host 工具调用。新的事件名区分各类载荷，会话格式仍为 V4。

<a id="verification"></a>
## 验证

已有的 `host-call.spec.ts` 和 `repair.spec.ts` 共通过 40 个 Vitest 用例。

<a id="dev-note"></a>
## 开发备注

无。
