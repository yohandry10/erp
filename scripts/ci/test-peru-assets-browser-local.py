"""UAT en Chromium contra Web/API/SQL locales; nunca sustituye el API con mocks."""
import datetime
import json
import os
import pathlib
import re
import subprocess
import time
import traceback
import urllib.parse
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect

assert os.environ['E2E_EPHEMERAL_LOCAL_DB'] == '1'
assert os.environ['PGHOST'] == '127.0.0.1'
assert os.environ['PGDATABASE'] == 'erp_e2e'
web = os.environ['LOCAL_WEB_URL']
assert urllib.parse.urlparse(web).hostname in ('127.0.0.1', 'localhost')
output = pathlib.Path(os.environ['LOCAL_INTEGRATED_OUTPUT_DIR'])
fixture = json.loads((output / 'asset-browser-fixture.json').read_bytes())

def sql(query):
    return subprocess.check_output([os.environ['PSQL_BIN'], '-XqAt', '-h', '127.0.0.1', '-p', os.environ['PGPORT'], '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], input=query, text=True, creationflags=subprocess.CREATE_NO_WINDOW).strip()

assert sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;") == 'erp_e2e|DEV|localerpephemeralqax'
tenant = fixture['tenant']
assert re.fullmatch(r'[0-9a-f-]{36}', tenant)
checks, http, page_errors = [], [], []
proof = dict(success=False, remoteWrites=False, complete_acceptance=False, scope='Chromium: alta, tres ediciones, cronograma, depreciación/reintento, baja y recuperación de lectura con API/SQL locales', checks=checks, requests=http, pageErrors=page_errors)

def record(name, action):
    action()
    checks.append(dict(operation=name, passed=True))
    (output / 'assets-browser.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2), encoding='utf-8')

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    context = browser.new_context(viewport=dict(width=1440, height=1000), timezone_id='America/Lima', locale='es-PE')
    context.route('**/*', lambda route: route.continue_() if urllib.parse.urlparse(route.request.url).hostname in ('127.0.0.1', 'localhost', '::1') else route.abort('blockedbyclient'))
    page = context.new_page()
    page.set_default_timeout(25000)
    page.on('pageerror', lambda err: page_errors.append(str(err)[:400]))
    def observed(response):
        url = urllib.parse.urlparse(response.url)
        if '/api/contabilidad/activos-fijos' in url.path:
            http.append(dict(method=response.request.method, endpoint=re.sub(r'[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}', ':id', url.path), status=response.status))
    page.on('response', observed)
    try:
        page.goto(web + '/login/', timeout=120000)
        page.locator('#email').fill(fixture['email'])
        page.locator('#password').fill('Cliente-Local-2026-Only!')
        for attempt in range(2):
            with page.expect_response(lambda r: r.request.method == 'POST' and urllib.parse.urlparse(r.url).path.rstrip('/').endswith('/api/auth/login')) as res:
                page.get_by_role('button', name='Iniciar Sesión', exact=True).click()
            if res.value.status == 429 and attempt == 0:
                seconds = int(res.value.header_value('retry-after') or 60)
                assert 0 < seconds <= 60
                time.sleep(seconds)
                continue
            assert res.value.status == 201, res.value.status
            break
        expect(page).to_have_url(re.compile(r'/dashboard/'), timeout=60000)
        today = datetime.datetime.now(ZoneInfo('America/Lima')).date()
        def open_period(month=today):
            page.goto(web + '/dashboard/contabilidad/periodos/nuevo/', timeout=120000)
            page.wait_for_load_state('networkidle', timeout=60000)
            expect(page.get_by_role('button', name='Crear Período', exact=True)).to_be_visible(timeout=60000)
            page.screenshot(path=str(output / f'assets-browser-period-form-{month:%Y%m}.png'), full_page=True)
            page.locator('#anio').select_option(str(month.year))
            page.locator('#mes').select_option(str(month.month))
            with page.expect_response(lambda r: r.request.method == 'POST' and urllib.parse.urlparse(r.url).path.rstrip('/').endswith('/contabilidad/periodos')) as res:
                page.get_by_role('button', name='Crear Período', exact=True).click()
            assert res.value.status == 201, res.value.json()
            assert sql(f"SELECT estado FROM periodos_contables WHERE tenant_id='{tenant}'::uuid AND anio={month.year} AND mes={month.month};") == 'ABIERTO'
            expect(page).to_have_url(re.compile(r'/contabilidad/periodos/?$'), timeout=60000)
        record('Apertura explícita del período desde su formulario', open_period)
        page.goto(web + '/dashboard/contabilidad/activos-fijos/', timeout=120000)
        page.wait_for_load_state('networkidle', timeout=60000)
        expect(page.get_by_role('button', name='Registrar activo', exact=True)).to_be_visible(timeout=60000)
        page.screenshot(path=str(output / 'assets-browser-initial.png'), full_page=True)
        # Reconocimiento del DOM renderizado antes de operar formularios.
        (output / 'assets-browser-initial.html').write_text(page.content(), encoding='utf-8')
        code = 'AF-UI-UAT'
        balances = page.get_by_role('region', name='Saldos de activos vigentes', exact=True)
        def asset():
            value = sql(f"SELECT row_to_json(a) FROM activos_fijos a WHERE tenant_id='{tenant}'::uuid AND codigo='{code}';")
            assert value, 'El activo no existe en SQL'
            return json.loads(value)
        def create():
            page.get_by_role('button', name='Registrar activo', exact=True).click()
            expect(page.get_by_label('Código del activo', exact=True)).to_be_visible()
            page.get_by_label('Código del activo', exact=True).fill(code)
            page.get_by_label('Nombre del activo', exact=True).fill('Equipo navegador A')
            page.get_by_label('Fecha de adquisición', exact=True).fill(today.isoformat())
            page.get_by_label('Inicio de depreciación', exact=True).fill(today.replace(day=1).isoformat())
            page.get_by_role('spinbutton', name='Valor de adquisición', exact=True).fill('12000')
            page.get_by_label('Valor residual', exact=True).fill('0')
            page.get_by_label('Vida útil en meses', exact=True).fill('12')
            with page.expect_response(lambda r: r.request.method == 'POST' and urllib.parse.urlparse(r.url).path.rstrip('/').endswith('/activos-fijos')) as res:
                page.get_by_role('button', name='Guardar activo', exact=True).click()
            assert res.value.status == 201, res.value.status
            expect(page.get_by_role('button', name='Editar ' + code, exact=True)).to_be_visible()
            assert asset()['nombre'] == 'Equipo navegador A'
            expect(balances.get_by_text('12,000.00', exact=True)).to_have_count(2)
            expect(balances.get_by_text('0.00', exact=True)).to_have_count(1)
        record('Alta desde el formulario persiste el activo', create)
        def edit():
            observed_names = []
            for name in ('Equipo navegador B', 'Equipo navegador C', 'Equipo navegador B'):
                page.get_by_role('button', name='Editar ' + code, exact=True).click()
                page.get_by_label('Nombre editado', exact=True).fill(name)
                with page.expect_response(lambda r: r.request.method == 'PUT' and '/api/contabilidad/activos-fijos/' in r.url) as res:
                    page.get_by_role('button', name='Guardar', exact=True).click()
                assert res.value.status == 200
                expect(page.get_by_label('Nombre editado', exact=True)).not_to_be_visible()
                observed_names.append(asset()['nombre'])
            assert observed_names == ['Equipo navegador B', 'Equipo navegador C', 'Equipo navegador B'], observed_names
        record('Tres ediciones B→C→B guardan cada nombre real', edit)
        def schedule():
            with page.expect_response(lambda r: '/cronograma' in r.url and '/activos-fijos/' in r.url) as res:
                page.get_by_role('button', name='Ver cronograma ' + code, exact=True).click()
            assert res.value.status == 200
            expect(page.get_by_text('Cronograma — ' + code, exact=True)).to_be_visible()
            assert len(res.value.json()['data']) == 12
            page.screenshot(path=str(output / 'assets-browser-schedule.png'), full_page=True)
            page.get_by_role('button', name='Cerrar', exact=True).click()
        record('Cronograma visible con las doce cuotas', schedule)
        page.on('dialog', lambda dialog: dialog.accept())
        def depreciate():
            page.locator('#activos-fijos-ano').fill(str(today.year))
            page.locator('#activos-fijos-mes').fill(str(today.month))
            # Se identifica el botón real en el DOM, sin depender del icono.
            button = page.get_by_role('button', name=re.compile(r'^Depreciar'))
            for turn in range(2):
                with page.expect_response(lambda r: r.request.method == 'POST' and '/activos-fijos/depreciar' in r.url) as res:
                    button.click()
                assert res.value.status == 201, res.value.json()
                assert float(asset()['depreciacion_acumulada']) == 1000, asset()
            assert sql(f"SELECT count(*) FROM depreciaciones WHERE activo_id='{asset()['id']}'::uuid;") == '1'
            assert sql(f"SELECT count(*) FROM outbox_events WHERE tenant_id='{tenant}'::uuid AND event_type='depreciacion.generada';") == '1'
            expect(balances.get_by_text('1,000.00', exact=True)).to_have_count(1)
            expect(balances.get_by_text('11,000.00', exact=True)).to_have_count(1)
        record('Depreciar y repetir desde UI deja una cuota y un evento', depreciate)
        def edit_estimate(life=None, residual=None):
            page.get_by_role('button', name='Editar ' + code, exact=True).click()
            if life is not None:
                page.get_by_label('Vida útil editada', exact=True).fill(str(life))
            if residual is not None:
                page.get_by_label('Valor residual editado', exact=True).fill(str(residual))
            with page.expect_response(lambda r: r.request.method == 'PUT' and '/api/contabilidad/activos-fijos/' in r.url) as res:
                page.get_by_role('button', name='Guardar', exact=True).click()
            assert res.value.status == 200, res.value.json()
            expect(page.get_by_label('Nombre editado', exact=True)).not_to_be_visible()

        def revised_schedule():
            with page.expect_response(lambda r: '/cronograma' in r.url and '/activos-fijos/' in r.url) as res:
                page.get_by_role('button', name='Ver cronograma ' + code, exact=True).click()
            assert res.value.status == 200
            expect(page.get_by_text('Cronograma — ' + code, exact=True)).to_be_visible()
            return res.value.json()['data']

        def life_revision():
            first_history = sql(f"SELECT row_to_json(d) FROM depreciaciones d WHERE activo_id='{asset()['id']}'::uuid;")
            edit_estimate(life=24)
            rows = revised_schedule()
            assert len(rows) == 24 and float(rows[0]['cuota']) == 1000 and float(rows[1]['cuota']) == 478.26, rows[:2]
            page.screenshot(path=str(output / 'assets-browser-life-revision.png'), full_page=True)
            page.get_by_role('button', name='Cerrar', exact=True).click()
            next_month = (today.replace(day=1) + datetime.timedelta(days=32)).replace(day=1)
            open_period(next_month)
            page.goto(web + '/dashboard/contabilidad/activos-fijos/', timeout=120000)
            page.wait_for_load_state('networkidle', timeout=60000)
            page.locator('#activos-fijos-ano').fill(str(next_month.year))
            page.locator('#activos-fijos-mes').fill(str(next_month.month))
            for turn in range(2):
                with page.expect_response(lambda r: r.request.method == 'POST' and '/activos-fijos/depreciar' in r.url) as res:
                    page.get_by_role('button', name=re.compile(r'^Depreciar')).click()
                assert res.value.status == 201, res.value.json()
                assert float(asset()['depreciacion_acumulada']) == 1478.26, asset()
            assert sql(f"SELECT count(*) FROM depreciaciones WHERE activo_id='{asset()['id']}'::uuid;") == '2'
            assert sql(f"SELECT count(*) FROM outbox_events WHERE tenant_id='{tenant}'::uuid AND event_type='depreciacion.generada';") == '2'
            assert sql(f"SELECT row_to_json(d) FROM depreciaciones d WHERE activo_id='{asset()['id']}'::uuid AND periodo='{today:%Y-%m}';") == first_history
            expect(balances.get_by_text('10,521.74', exact=True)).to_have_count(1)
        record('Vida útil editada por UI conserva1000 y registra478.26 sin duplicar', life_revision)

        def residual_revision():
            edit_estimate(residual=1000)
            rows = revised_schedule()
            assert float(rows[0]['cuota']) == 1000 and float(rows[1]['cuota']) == 478.26
            assert float(rows[2]['cuota']) == 432.81 and float(rows[-1]['valor_neto']) == 1000, rows[2:3]
            page.screenshot(path=str(output / 'assets-browser-residual-revision.png'), full_page=True)
            page.get_by_role('button', name='Cerrar', exact=True).click()
            assert float(asset()['depreciacion_acumulada']) == 1478.26
        record('Residual revisado por UI sólo cambia la proyección pendiente', residual_revision)
        def retire():
            page.get_by_role('button', name='Retirar ' + code, exact=True).click()
            last_date = sql(f"SELECT max(fecha_depreciacion)::text FROM depreciaciones WHERE activo_id='{asset()['id']}'::uuid;")
            page.get_by_label('Fecha de baja', exact=True).fill(last_date)
            page.get_by_label('Motivo de retiro', exact=True).fill('Baja navegador con valor neto')
            with page.expect_response(lambda r: r.request.method == 'POST' and '/activos-fijos/' in r.url and '/baja' in r.url) as res:
                page.get_by_role('button', name='Confirmar', exact=True).click()
            assert res.value.status == 201, res.value.json().get('message')
            assert asset()['situacion'] == 'BAJA'
            entry = asset()['asiento_baja_id']
            assert sql(f"SELECT estado FROM asientos_contables WHERE id='{entry}'::uuid;") == 'CONFIRMADO'
            assert float(sql(f"SELECT sum(debe-haber) FROM detalle_asientos WHERE asiento_id='{entry}'::uuid;")) == 0
            expect(page.get_by_role('button', name='Retirar ' + code, exact=True)).not_to_be_visible()
            # La fila conserva el costo histórico; los saldos vigentes ya no
            # incluyen un bien retirado y respaldado por su asiento de baja.
            expect(balances.get_by_text('0.00', exact=True)).to_have_count(3)
            expect(balances.get_by_text('11,000.00', exact=True)).to_have_count(0)
            page.screenshot(path=str(output / 'assets-browser-retired.png'), full_page=True)
        record('Baja desde UI deja asiento cuadrado y retira el bien de los saldos vigentes', retire)
        def recover():
            assert sql("SELECT has_table_privilege('service_role','public.activos_fijos','SELECT');") == 't'
            sql('REVOKE SELECT ON public.activos_fijos FROM service_role;')
            try:
                page.reload(timeout=120000)
                page.wait_for_load_state('networkidle', timeout=60000)
                expect(page.get_by_role('alert').filter(has_text='No se pudo cargar el registro de activos y centros de costo')).to_be_visible()
                expect(page.get_by_text('Todavía no hay activos registrados.', exact=True)).not_to_be_visible()
                expect(balances).not_to_be_visible()
                expect(page.get_by_role('button', name='Registrar activo', exact=True)).to_be_disabled()
                expect(page.get_by_role('button', name='Depreciar período', exact=True)).to_be_disabled()
                page.screenshot(path=str(output / 'assets-browser-outage.png'), full_page=True)
            finally:
                sql('GRANT SELECT ON public.activos_fijos TO service_role;')
            page.get_by_role('button', name='Reintentar', exact=True).click()
            page.wait_for_load_state('networkidle', timeout=60000)
            expect(page.get_by_role('button', name='Ver cronograma ' + code, exact=True)).to_be_visible()
            expect(page.get_by_role('alert').filter(has_text='No se pudo cargar el registro de activos y centros de costo')).not_to_be_visible()
            expect(balances).to_be_visible()
            expect(balances.get_by_text('0.00', exact=True)).to_have_count(3)
            page.screenshot(path=str(output / 'assets-browser-recovered.png'), full_page=True)
        record('Lectura caída no inventa ceros ni lista vacía y Reintentar recupera la pantalla', recover)
        assert not page_errors, page_errors
        proof['success'] = len(checks) == 9 and all(c['passed'] for c in checks)
    except Exception as error:
        checks.append(dict(operation='Flujo de activos en navegador', passed=False, message=str(error)[:1500], traceback=traceback.format_exc()[-2200:]))
        try: page.screenshot(path=str(output / 'assets-browser-failure.png'), full_page=True)
        except Exception: pass
    finally:
        (output / 'assets-browser.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2), encoding='utf-8')
        browser.close()
print(json.dumps(dict(success=proof['success'], checks=len(checks)), ensure_ascii=False))
raise SystemExit(0 if proof['success'] else 1)
