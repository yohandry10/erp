import * as Sentry from '@sentry/nextjs'
import { isSentryDsn, privateSentryError, sentryDataCollection } from './lib/observability/sentry-privacy'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
if (isSentryDsn(dsn)) Sentry.init({
  dsn,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'production',
  release: process.env.NEXT_PUBLIC_APP_COMMIT_SHA,
  defaultIntegrations: false,
  integrations: [Sentry.globalHandlersIntegration(), Sentry.browserApiErrorsIntegration(), Sentry.dedupeIntegration()],
  dataCollection: sentryDataCollection,
  sendClientReports: false,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  tracePropagationTargets: [],
  beforeSendLog: () => null,
  beforeSendMetric: () => null,
  beforeSend: privateSentryError,
})
