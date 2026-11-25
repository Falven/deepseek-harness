/** Host-only execution and filesystem operations used by one Session's change recorder. */
import type { Session } from '@deepseek-ai/dsh-session'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'

/** A bounded source read; non-regular paths return undefined. */
export type WorkspaceCaptureBytes = Uint8Array | { kind: 'absent' | 'oversized' } | undefined

/** Filesystem operations for private Git objects and indexes in the subprocess execution world. */
export interface WorkspaceChangesScratch {
  /** Create a directory and any missing parents. */
  mkdir(path: string): Promise<void>
  /** Create a private directory with the supplied path prefix. */
  mkdtemp(prefix: string): Promise<string>
  /** Copy the repository index into the private directory; a missing source rejects with ENOENT. */
  copyFile(source: string, destination: string): Promise<void>
  /** Remove an owned private directory recursively, including during disposal. */
  remove(path: string): Promise<void>
}

/** One Session's captured execution world; content-addressed capture copies remain Host-local. */
export interface WorkspaceChangesEnvironment {
  /** Canonical working directory, home directory, and temporary roots in the execution world. */
  paths: { cwd: string; home: string; temporaryRoots: readonly string[] }
  /** Resolve a source path through existing ancestors, including before the file exists. */
  canonicalPath(path: string, signal: AbortSignal): Promise<string>
  /** Read at most maxBytes + 1 bytes; distinguish absent, oversized, and non-regular sources. */
  readFile(path: string, maxBytes: number, signal: AbortSignal): Promise<WorkspaceCaptureBytes>
  /** Resolved Git and its matching execution world; null retains file-tool capture only. */
  git: { subprocess: SubprocessRuntime; executable: string; signal?: AbortSignal } | null
  /** Execution-world parent for Git scratch; absent reuses the native Host-local capture directory. */
  gitTempRoot?: string
  /** Absolute files or directories Git may summarize and serve; absent means the complete repository. */
  gitPaths?: readonly string[]
  /** Private Git filesystem operations in the same execution world as git. */
  scratch: WorkspaceChangesScratch
  /** Release provider resources after recording, comparison reads, and scratch cleanup settle. */
  dispose(): Promise<void>
}

/** Recorder initialization, awaited before the first baseline snapshot in a Session directory. */
export interface WorkspaceChangesEnvironmentRequest {
  session: Session
  cwd: string
  signal: AbortSignal
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** Resolve one Session's execution world; the default uses the Host filesystem and subprocess capability.
     * @param request - Session, working directory, and recorder lifetime cancellation.
     * @param next - remaining providers and the native local default.
     * @mode waterfall
     */
    'workspace-changes/environment'(
      request: WorkspaceChangesEnvironmentRequest,
      next: () => Promise<WorkspaceChangesEnvironment>,
    ): Promise<WorkspaceChangesEnvironment>
  }
}
