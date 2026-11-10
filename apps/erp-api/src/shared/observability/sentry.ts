import * as Sentry from '@sentry/node';
import { isSentryDsn, privateSentryError, sentryDataCollection } from './sentry-privacy';

export function configureErrorMonitoring(dsn?: string, environment = 'production', release?: string): void {
  if (!dsn) return;
  if (!isSentryDsn(dsn)) throw new Error('SENTRY_DSN debe apuntar al recolector HTTPS de Sentry.');
  Sentry.init({
    dsn, environment, release,
    defaultIntegrations: false,
    integrations: [Sentry.onUncaughtExceptionIntegration(), Sentry.onUnhandledRejectionIntegration({ mode: 'strict' })],
    dataCollection: sentryDataCollection,
    includeServerName: false,
    sendClientReports: false,
    tracesSampleRate: 0,
    tracePropagationTargets: [],
    beforeSendLog: () => null,
    beforeSendMetric: () => null,
    beforeSend: privateSentryError,
  });
}

export function captureUnexpectedError(error: unknown): void {
  if (!Sentry.isInitialized()) return;
  try { Sentry.captureException(error); } catch { /* Monitoring cannot break the HTTP response. */ }
}

export const flushErrorMonitoring = Sentry.flush;
