-- =============================================
-- DATOS DE EJEMPLO PARA MÓDULO RRHH COMPLETO
-- =============================================

-- 1. PAGOS DE EMPLEADOS (usando empleados existentes)
INSERT INTO rrhh_pagos (id, empleado_id, periodo, monto_bruto, descuento_afp, descuento_renta, total_descuentos, monto_neto, estado, fecha_pago) VALUES
('a1b2c3d4-e5f6-7890-1234-567890abcdef', 
 (SELECT id FROM empleados WHERE nombres = 'Juan Carlos' AND apellidos = 'Pérez García' LIMIT 1),
 '2024-12', 4602.50, 368.20, 138.07, 695.22, 3907.28, 'procesado', '2024-12-30'),

('b2c3d4e5-f6g7-8901-2345-678901bcdefg', 
 (SELECT id FROM empleados WHERE nombres = 'María Elena' AND apellidos = 'Rodríguez Silva' LIMIT 1),
 '2024-12', 3902.50, 312.20, 78.05, 551.05, 3351.45, 'procesado', '2024-12-30'),

('c3d4e5f6-g7h8-9012-3456-789012cdefgh', 
 (SELECT id FROM empleados WHERE nombres = 'Carlos Alberto' AND apellidos = 'Mendoza Vargas' LIMIT 1),
 '2024-12', 2200.00, 176.00, 0.00, 286.00, 1914.00, 'procesado', '2024-12-30'),

('d4e5f6g7-h8i9-0123-4567-890123defghi', 
 (SELECT id FROM empleados WHERE nombres = 'Ana Sofía' AND apellidos = 'Torres López' LIMIT 1),
 '2024-12', 3200.00, 256.00, 46.00, 419.19, 2780.81, 'procesado', '2024-12-30'),

-- Pagos pendientes enero 2025
('e5f6g7h8-i9j0-1234-5678-901234efghij', 
 (SELECT id FROM empleados WHERE nombres = 'Juan Carlos' AND apellidos = 'Pérez García' LIMIT 1),
 '2025-01', 4602.50, 368.20, 138.07, 695.22, 3907.28, 'pendiente', NULL),

('f6g7h8i9-j0k1-2345-6789-012345fghijk', 
 (SELECT id FROM empleados WHERE nombres = 'María Elena' AND apellidos = 'Rodríguez Silva' LIMIT 1),
 '2025-01', 3902.50, 312.20, 78.05, 551.05, 3351.45, 'pendiente', NULL);

-- 2. CONTRATOS PARA LOS EMPLEADOS
INSERT INTO contratos (id, empleado_id, tipo_contrato, fecha_inicio, fecha_fin, salario, estado, beneficios, observaciones) VALUES
('11111111-2222-3333-4444-555555555555',
 (SELECT id FROM empleados WHERE nombres = 'Juan Carlos' AND apellidos = 'Pérez García' LIMIT 1),
 'indefinido', '2020-11-14', NULL, 4602.50, 'activo', 'Seguro médico, bonos por desempeño', 'Contrato renovado automáticamente'),

('22222222-3333-4444-5555-666666666666',
 (SELECT id FROM empleados WHERE nombres = 'María Elena' AND apellidos = 'Rodríguez Silva' LIMIT 1),
 'indefinido', '2019-02-28', NULL, 3902.50, 'activo', 'Seguro médico, capacitaciones', 'Empleada de confianza'),

('33333333-4444-5555-6666-777777777777',
 (SELECT id FROM empleados WHERE nombres = 'Carlos Alberto' AND apellidos = 'Mendoza Vargas' LIMIT 1),
 'temporal', '2021-03-15', '2025-03-14', 2200.00, 'activo', 'Básicos según ley', 'Contrato a término fijo'),

('44444444-5555-6666-7777-888888888888',
 (SELECT id FROM empleados WHERE nombres = 'Ana Sofía' AND apellidos = 'Torres López' LIMIT 1),
 'indefinido', '2022-12-14', NULL, 3200.00, 'activo', 'Seguro médico, bono tecnológico', 'Contrato desarrollador');

-- 3. VACANTES DISPONIBLES
INSERT INTO vacantes (id, titulo, descripcion, departamento_id, puesto_solicitado, salario_min, salario_max, estado, fecha_publicacion, fecha_cierre) VALUES
('vac-00001', 'Desarrollador Senior PHP', 'Desarrollador con experiencia en PHP, Laravel y MySQL', 
 (SELECT id FROM departamentos WHERE nombre = 'Sistemas' LIMIT 1), 
 'Desarrollador Senior', 3500.00, 4500.00, 'activa', '2024-12-15', '2025-01-15'),

('vac-00002', 'Analista Contable', 'Contador con experiencia en NIIF y sistemas contables', 
 (SELECT id FROM departamentos WHERE nombre = 'Contabilidad' LIMIT 1), 
 'Analista Contable', 2800.00, 3500.00, 'activa', '2024-12-10', '2025-01-10'),

('vac-00003', 'Vendedor Senior', 'Vendedor con experiencia en ventas B2B y manejo de CRM', 
 (SELECT id FROM departamentos WHERE nombre = 'Ventas' LIMIT 1), 
 'Vendedor Senior', 2200.00, 3000.00, 'activa', '2024-12-01', '2024-12-31');

-- 4. CANDIDATOS PARA LAS VACANTES
INSERT INTO candidatos (id, vacante_id, nombres, apellidos, email, telefono, fecha_postulacion, experiencia_anos, puntuacion_cv, estado, observaciones) VALUES
('cand-00001', 'vac-00001', 'Roberto', 'Mendez Castro', 'rmendez@email.com', '987654321', '2024-12-16', 5, 85, 'entrevista', 'Buen perfil técnico'),
('cand-00002', 'vac-00001', 'Patricia', 'Flores Lima', 'pflores@email.com', '987654322', '2024-12-17', 3, 72, 'postulante', 'Experiencia media'),
('cand-00003', 'vac-00002', 'Luis', 'García Rojas', 'lgarcia@email.com', '987654323', '2024-12-12', 7, 92, 'seleccionado', 'Excelente experiencia'),
('cand-00004', 'vac-00003', 'Carmen', 'Vega Torres', 'cvega@email.com', '987654324', '2024-12-02', 4, 78, 'entrevista', 'Buenas referencias'),
('cand-00005', 'vac-00003', 'Miguel', 'Santos Díaz', 'msantos@email.com', '987654325', '2024-12-03', 2, 65, 'rechazado', 'Poca experiencia');

-- 5. ASISTENCIAS DE EJEMPLO (ÚLTIMOS 7 DÍAS)
DO $$
DECLARE
    emp_record RECORD;
    fecha_actual DATE;
    i INTEGER;
BEGIN
    -- Para cada empleado activo
    FOR emp_record IN 
        SELECT id FROM empleados WHERE estado = 'activo'
    LOOP
        -- Generar asistencias para los últimos 7 días
        FOR i IN 0..6 LOOP
            fecha_actual := CURRENT_DATE - i;
            
            -- Solo días laborables (lunes a viernes)
            IF EXTRACT(DOW FROM fecha_actual) BETWEEN 1 AND 5 THEN
                INSERT INTO asistencia (
                    empleado_id, 
                    fecha, 
                    hora_entrada, 
                    hora_salida, 
                    horas_trabajadas, 
                    estado
                ) VALUES (
                    emp_record.id,
                    fecha_actual,
                    CASE 
                        WHEN random() > 0.9 THEN '09:15:00'  -- 10% tarde
                        ELSE '08:00:00'                      -- 90% puntual
                    END,
                    CASE 
                        WHEN i = 0 THEN NULL                -- Hoy sin salida aún
                        WHEN random() > 0.8 THEN '18:30:00'  -- 20% trabajo extra
                        ELSE '17:00:00'                      -- 80% horario normal
                    END,
                    CASE 
                        WHEN i = 0 THEN NULL                -- Hoy sin calcular
                        WHEN random() > 0.8 THEN 9.5        -- Trabajo extra
                        ELSE 8.0                             -- Horario normal
                    END,
                    'presente'
                );
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- 6. ACTUALIZAR EMPLEADOS CON SALARIOS (si no los tienen)
UPDATE empleados SET salario = 4602.50 WHERE nombres = 'Juan Carlos' AND apellidos = 'Pérez García';
UPDATE empleados SET salario = 3902.50 WHERE nombres = 'María Elena' AND apellidos = 'Rodríguez Silva';
UPDATE empleados SET salario = 2200.00 WHERE nombres = 'Carlos Alberto' AND apellidos = 'Mendoza Vargas';
UPDATE empleados SET salario = 3200.00 WHERE nombres = 'Ana Sofía' AND apellidos = 'Torres López';

-- 7. CREAR ALGUNOS BENEFICIOS BÁSICOS
INSERT INTO beneficios (id, nombre, descripcion, tipo, monto, estado) VALUES
('ben-001', 'Seguro Médico', 'Seguro médico familiar', 'salud', 150.00, 'activo'),
('ben-002', 'Bono Alimentario', 'Vales de alimentación', 'alimentario', 200.00, 'activo'),
('ben-003', 'Bono Transporte', 'Subsidio de transporte', 'transporte', 100.00, 'activo'),
('ben-004', 'Capacitación', 'Cursos y certificaciones', 'educativo', 500.00, 'activo');

-- 8. ASIGNAR BENEFICIOS A EMPLEADOS
INSERT INTO empleado_beneficios (empleado_id, beneficio_id, fecha_inicio, estado) 
SELECT e.id, b.id, e.fecha_ingreso, 'activo'
FROM empleados e, beneficios b 
WHERE e.estado = 'activo' AND b.id IN ('ben-001', 'ben-002');

COMMIT; 