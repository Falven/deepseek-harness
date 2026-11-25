---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-27-host-tool-call-events

English | [中文](2026-10-27-host-tool-call-events.zh.md)

## Summary

Records Host-owned Tool acceptance, dispatch intent, and final outcome as Session events outside model history.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Earlier Session readers reject these required event types before resuming the log. Current readers preserve older Sessions and settle interrupted Host calls from their recorded acceptance and dispatch state. The new event names discriminate the payloads and keep the Session format at V4.

<a id="verification"></a>
## Verification

The existing `host-call.spec.ts` and `repair.spec.ts` passed 40 Vitest cases.

<a id="dev-note"></a>
## Dev Note

None.
