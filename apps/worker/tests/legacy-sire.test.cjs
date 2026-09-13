const { test } = require('node:test');
const assert = require('node:assert/strict');
const { UnrecoverableError } = require('bullmq');
const { rejectLegacySireGeneration } = require('../dist/jobs/legacy-sire.job.js');

test('trabajos SIRE históricos quedan fallidos y no simulan un archivo completado', async () => {
  await assert.rejects(rejectLegacySireGeneration(), error =>
    error instanceof UnrecoverableError && error.message.includes('SIRE_LEGACY_QUEUE_RETIRED')
      && error.message.includes('/api/sire/generar-reporte'));
});
