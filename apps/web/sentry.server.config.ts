import * as Sentry from '@sentry/nextjs'
import { isSentryDsn, privateSentryError, sentryDataCollection } from './lib/observability/sentry-privacy'

const dsn = process.env.SENTRY_DSN
if (isSentryDsn(dsn)) Sentry.init({
  dsn,
  environment: process.env.SENTRY_ENVIRONMENT || 'production',
  release: process.env.APP_COMMIT_SHA,
  defaultIntegrations: false,
  dataCollection: sentryDataCollection,
  includeServerName: false,
  sendClientReports: false,
  tracesSampleRate: 0,
  tracePropagationTargets: [],
  beforeSendLog: () => null,
  beforeSendMetric: () => null,
  beforeSend: privateSentryError,
})
