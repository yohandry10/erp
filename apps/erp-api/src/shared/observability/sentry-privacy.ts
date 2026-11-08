import type { ErrorEvent, StackFrame } from '@sentry/node'

export function isSentryDsn(value: string | undefined): value is string {
  return typeof value === 'string' && /^https:\/\/[a-f0-9]{32}@o[0-9]+\.ingest(?:\.(?:us|de))?\.sentry\.io\/[0-9]+$/.test(value)
}

export const sentryDataCollection = {
  userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
  graphQL: { document: false, variables: false }, genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false }, databaseQueryData: false, queues: false,
  stackFrameVariables: false, frameContextLines: 0,
}

function sourceFrame(frame: StackFrame): StackFrame {
  const path = (frame.filename || '').replace(/\\/g, '/').split(/[?#]/, 1)[0]
  const marker = path.lastIndexOf('/src/') >= 0 ? path.lastIndexOf('/src/') + 1 : path.indexOf('_next/')
  const filename = marker >= 0 ? path.slice(marker) : path.split('/').pop()
  return {
    filename: filename && /^[\w./-]{1,240}\.(?:[cm]?js|tsx?)$/.test(filename) && !filename.includes('..') ? filename : undefined,
    function: frame.function && /^[\w.$<> /-]{1,160}$/.test(frame.function) ? frame.function : undefined,
    lineno: Number.isSafeInteger(frame.lineno) ? frame.lineno : undefined,
    colno: Number.isSafeInteger(frame.colno) ? frame.colno : undefined,
    in_app: frame.in_app === true,
  }
}

/** Retain error location for diagnosis; never transmit business/auth/request data. */
export function privateSentryError(event: ErrorEvent): ErrorEvent | null {
  const values = event.exception?.values
  if (!values?.length) return null
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: 'javascript',
    level: event.level === 'fatal' ? 'fatal' : 'error',
    exception: { values: values.slice(-3).map(value => ({
      type: value.type && /^[A-Za-z_$][\w.$]{0,79}$/.test(value.type) ? value.type : 'Error',
      value: 'Unexpected application error',
      mechanism: { type: 'generic', handled: value.mechanism?.handled !== false },
      stacktrace: value.stacktrace ? { frames: value.stacktrace.frames?.slice(-40).map(sourceFrame) } : undefined,
    })) },
    // Release/environment are supplied by this deployment, never copied from a request.
    release: event.release && /^[a-f0-9]{40}$/.test(event.release) ? event.release : undefined,
    environment: event.environment && /^[a-z0-9._-]{1,40}$/.test(event.environment) ? event.environment : undefined,
  }
}
