import type { Reporter, TestCase, TestResult, TestStep, FullResult } from '@playwright/test/reporter'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Conserva las aserciones que realmente se ejecutaron, incluidas sus ubicaciones.
// Un conteo verde o el nombre de otro test no sustituye la aserción de un requisito.
export default class UatAssertionsReporter implements Reporter {
  private root = path.resolve(process.cwd(), '../..')
  private attempts = new Map<string, any>()
  private sources: Record<string, string> = {}
  private digest(file: string) { return createHash('sha256').update(readFileSync(file)).digest('hex') }
  private key(test: TestCase, result: TestResult) { return `${test.id}:${result.retry}` }
  onBegin() {
    const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','apps/web/app','apps/web/components','apps/web/contexts','apps/web/hooks','apps/web/lib','apps/web/public','apps/web/tests',
      'apps/erp-api/src','apps/erp-api/tests','libs','supabase/migrations','supabase/verify','patches','scripts/ci'],
      {cwd:this.root,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024}).trim().split(/\r?\n/)
      .map(file=>file.replaceAll('\\','/')).filter(file=>!file.split('/').some(part=>['node_modules','dist','coverage','test-results','playwright-report','screenshots','__pycache__'].includes(part)))
    files.push('package.json','pnpm-lock.yaml','pnpm-workspace.yaml','apps/web/package.json','apps/web/next.config.js',
      'apps/erp-api/package.json','apps/erp-api/Dockerfile','apps/worker/Dockerfile')
    this.sources=Object.fromEntries([...new Set(files)].sort().map(file=>[file,this.digest(path.join(this.root,file))]))
  }
  onTestBegin(test: TestCase, result: TestResult) {
    const file = path.relative(this.root, test.location.file).replaceAll('\\', '/')
    this.sources[file] ??= this.digest(test.location.file)
    this.attempts.set(this.key(test,result), { id:test.id, retry:result.retry, title:test.titlePath(),
      file, line:test.location.line, status:'running', assertions:[] })
  }
  onStepEnd(test: TestCase, result: TestResult, step: TestStep) {
    if (!['expect','test.step'].includes(step.category)) return
    this.attempts.get(this.key(test,result))?.assertions.push({ title:step.titlePath(), category:step.category,
      file:step.location ? path.relative(this.root,step.location.file).replaceAll('\\','/') : null,
      line:step.location?.line, column:step.location?.column, duration:step.duration,
      result:step.error ? 'FAIL' : 'PASS', error:step.error?.message })
  }
  onTestEnd(test: TestCase, result: TestResult) {
    const record=this.attempts.get(this.key(test,result))
    if(record) Object.assign(record,{status:result.status,expectedStatus:test.expectedStatus,errors:result.errors.map(error=>error.message),
      sourceUnchanged:this.digest(test.location.file)===this.sources[record.file]})
  }
  async onEnd(result: FullResult) {
    const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR
    if(process.env.E2E_EPHEMERAL_LOCAL_DB!=='1'||!output||!path.resolve(output).startsWith(path.join(this.root,'artifacts')+path.sep)) {
      throw new Error('El reporte UAT sólo escribe evidencia del ensayo local efímero')
    }
    const attempts=[...this.attempts.values()]
    const sourcesUnchanged=Object.entries(this.sources).every(([file,digest])=>this.digest(path.join(this.root,file))===digest)
    const complete=result.status==='passed' && sourcesUnchanged && attempts.length>0 && attempts.every(r=>r.status==='passed' && r.sourceUnchanged)
    const phase=(process.env.UAT_ASSERTION_PHASE||'browser').replace(/[^a-zA-Z0-9_-]/g,'_')
    writeFileSync(path.join(output,phase+'-assertions.json'),JSON.stringify({complete,remoteWrites:false,sourcesUnchanged,
      sourceHashes:this.sources,attempts,scope:'executed Playwright assertions with exact source locations and product inputs hashed before/after execution; requirement binding remains explicit'},null,2))
    return {status:complete?'passed' as const:'failed' as const}
  }
}
