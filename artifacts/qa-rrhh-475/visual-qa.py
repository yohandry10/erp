import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE_URL = 'http://127.0.0.1:14673'
MOCK_URL = 'http://127.0.0.1:14674'
OUT = Path(__file__).resolve().parent

session = {
    'user': {
        'id': '47500000-0000-4000-8000-000000000001',
        'tenant_id': '47500000-0000-4000-8000-000000000010',
        'email': 'qa-rrhh-475@local.invalid',
        'nombre': 'QA',
        'apellido': 'RRHH 475',
        'roles': ['ADMIN'],
        'is_super_admin': False,
    }
}

failures = []
screens = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, color_scheme='dark')
    context.add_cookies([{
        'name': 'access_token', 'value': 'mock-access-token-475',
        'url': BASE_URL, 'httpOnly': True, 'sameSite': 'Lax',
    }])
    context.add_init_script(
        "window.localStorage.setItem('erp.auth.session.snapshot', JSON.stringify(%s));"
        % json.dumps(session)
    )
    page = context.new_page()
    page.clock.set_fixed_time(datetime(2026, 8, 11, 17, 30, tzinfo=timezone(timedelta(hours=-5))))
    page.on('pageerror', lambda error: failures.append(f'pageerror: {error}'))
    page.on('console', lambda message: failures.append(f'console: {message.text}') if message.type == 'error' else None)
    page.on('response', lambda response: failures.append(
        f'network: {response.status} {response.url}'
    ) if response.status >= 500 else None)

    def capture(screenshot_name):
        target = OUT / screenshot_name
        page.screenshot(path=str(target), full_page=True)
        if str(target) not in screens:
            screens.append(str(target))

    def visit(path, visible_text, screenshot_name):
        page.goto(f'{BASE_URL}{path}', wait_until='domcontentloaded')
        expect(page.get_by_text(visible_text, exact=False).first).to_be_visible(timeout=30000)
        capture(screenshot_name)

    visit('/dashboard/rrhh/', 'Recursos Humanos', '01-rrhh-maestro.png')
    expect(page.get_by_text('Ada Lovelace', exact=False).first).to_be_visible()
    page.get_by_role('button', name='Agregar empleado').first.click()
    expect(page.get_by_text('Agregar Nuevo Empleado', exact=False)).to_be_visible()
    page.locator('#empleado-modal-nombres').fill('Margaret')
    page.locator('#empleado-modal-apellidos').fill('Hamilton')
    page.locator('#empleado-modal-numero-documento').fill('47500009')
    page.locator('#empleado-modal-genero').select_option('femenino')
    page.locator('#empleado-modal-puesto').fill('Líder de software')
    page.locator('#empleado-modal-id-departamento').select_option('47500000-0000-4000-8000-000000000101')
    page.locator('#empleado-modal-fecha-ingreso').fill('2026-08-11')
    page.get_by_role('button', name='Guardar Empleado').click()
    expect(page.get_by_text('Margaret Hamilton', exact=False).first).to_be_visible(timeout=15000)
    capture('01-rrhh-maestro.png')

    visit('/dashboard/rrhh/asistencia/', 'Control de Asistencia', '02-asistencia.png')
    expect(page.get_by_text('Ada Lovelace', exact=False).first).to_be_visible()
    page.locator('button[title="Marcar Salida"]').first.click()
    expect(page.get_by_text('Completo', exact=False).first).to_be_visible(timeout=15000)
    capture('02-asistencia.png')

    visit('/dashboard/rrhh/contratos/', 'Gestión de Contratos', '03-contratos.png')
    page.get_by_role('button', name='Nuevo Contrato').click()
    expect(page.get_by_role('heading', name='Nuevo contrato')).to_be_visible()
    page.locator('#contrato-empleado').click()
    page.get_by_role('option', name='Ada Lovelace').click()
    page.locator('#contrato-cargo').fill('Principal Engineer')
    page.locator('#contrato-salario').fill('7000')
    page.get_by_role('button', name='Crear contrato').click()
    expect(page.get_by_text('Contrato creado', exact=False)).to_be_visible(timeout=15000)
    capture('03-contratos.png')

    visit('/dashboard/rrhh/candidatos/', 'CVs & Candidatos', '04-candidatos.png')
    page.get_by_role('button', name='Nueva Vacante').click()
    expect(page.get_by_role('heading', name='Nueva vacante')).to_be_visible()
    page.locator('#vacante-modal-titulo').fill('QA visual 475')
    page.locator('#vacante-modal-puesto-solicitado').fill('QA visual')
    page.locator('#vacante-modal-departamento-id').select_option('47500000-0000-4000-8000-000000000101')
    page.locator('#vacante-modal-fecha-limite').fill('2026-09-15')
    page.locator('#vacante-modal-descripcion').fill('Vacante creada durante la prueba visual 475.')
    page.get_by_role('button', name='Crear vacante').click()
    page.get_by_label('Filtrar candidatos por vacante').click()
    expect(page.get_by_role('option', name='QA visual 475', exact=True)).to_be_visible(timeout=15000)
    capture('04a-vacante-creada.png')
    page.keyboard.press('Escape')
    page.locator('button[title="Editar"]').first.click()
    expect(page.get_by_role('heading', name='Editar Candidato')).to_be_visible()
    page.locator('#candidatos-telefono').fill('999475475')
    page.get_by_role('button', name='Actualizar Candidato').click()
    expect(page.get_by_text('999475475', exact=True)).to_be_visible(timeout=15000)
    capture('04b-candidato-actualizado.png')

    visit('/dashboard/rrhh/planilla-electronica/', 'Planilla electrónica Perú', '05-planilla-electronica.png')
    expect(page.get_by_text('Ficha SUNAT por trabajador', exact=True)).to_be_visible(timeout=15000)
    page.get_by_role('button', name='Guardar ficha').click()
    expect(page.get_by_text('Ficha SUNAT guardada', exact=False)).to_be_visible(timeout=15000)
    target = OUT / '06-planilla-electronica-ficha-guardada.png'
    page.screenshot(path=str(target), full_page=True)
    screens.append(str(target))

    visit('/dashboard/configuracion/rrhh/', 'RRHH Perú', '07-configuracion-rrhh-pe.png')
    expect(page.get_by_text('Lista para operar', exact=False)).to_be_visible()

    state_response = context.request.get(f'{MOCK_URL}/__qa__/state')
    assert state_response.ok, state_response.text()
    state = state_response.json()
    assert len(state['employeeCreates']) == 1, state
    assert len(state['employeeCreates'][0]['key']) >= 8, state
    assert len(state['attendanceMarks']) == 1, state
    assert len(state['attendanceMarks'][0]['key']) >= 8, state
    assert state['attendanceMarks'][0]['body']['tipo'] == 'salida', state
    assert len(state['vacancyCreates']) == 1, state
    assert len(state['vacancyCreates'][0]['key']) >= 8, state
    assert len(state['contractCreates']) == 1, state
    assert state['contractCreates'][0]['body']['estado'] == 'vigente', state
    assert len(state['contractCreates'][0]['key']) >= 8, state
    assert len(state['candidateUpdates']) == 1, state
    assert state['candidateUpdates'][0]['path'].endswith('/47500000-0000-4000-8000-000000000401'), state
    assert len(state['candidateUpdates'][0]['key']) >= 8, state
    assert len(state['plameWrites']) == 1, state
    assert len(state['plameWrites'][0]['key']) >= 8, state

    browser.close()

failures = [item for item in failures if 'favicon.ico' not in item]
result = {
    'ok': not failures,
    'screenshots': screens,
    'mutations': {
        'employee_create': 1, 'attendance_exit': 1, 'vacancy_create': 1,
        'contract_create': 1,
        'candidate_update': 1,
        'plame_ficha_update': 1,
    },
    'browser_failures': failures,
}
(OUT / 'visual-results.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
if failures:
    raise AssertionError('\n'.join(failures))
print('QA_RRHH_475_VISUAL_OK: 7 vistas + empleado + asistencia + vacante + contrato + candidato + ficha PLAME')
