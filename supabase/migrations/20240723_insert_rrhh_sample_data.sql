-- Insertar departamentos de ejemplo
INSERT INTO public.departamentos (nombre) VALUES 
('Recursos Humanos'),
('Contabilidad'),
('Ventas'),
('Sistemas'),
('Gerencia General');

-- Insertar empleados de ejemplo
INSERT INTO public.empleados (
    nombres, 
    apellidos, 
    tipo_documento, 
    numero_documento, 
    fecha_nacimiento, 
    direccion, 
    telefono, 
    email, 
    puesto, 
    id_departamento, 
    fecha_ingreso, 
    estado
) VALUES 
(
    'Juan Carlos', 
    'Pérez García', 
    'DNI', 
    '12345678', 
    '1985-03-15', 
    'Av. Los Olivos 123, Lima', 
    '987654321', 
    'juan.perez@empresa.com', 
    'Jefe de Recursos Humanos', 
    (SELECT id FROM public.departamentos WHERE nombre = 'Recursos Humanos'),
    '2020-01-15', 
    'activo'
),
(
    'María Elena', 
    'Rodriguez Silva', 
    'DNI', 
    '87654321', 
    '1990-07-22', 
    'Jr. Las Flores 456, Lima', 
    '987123456', 
    'maria.rodriguez@empresa.com', 
    'Contadora Senior', 
    (SELECT id FROM public.departamentos WHERE nombre = 'Contabilidad'),
    '2019-03-01', 
    'activo'
),
(
    'Carlos Alberto', 
    'Mendoza Vargas', 
    'DNI', 
    '45678912', 
    '1988-11-10', 
    'Calle San Martín 789, Lima', 
    '987789123', 
    'carlos.mendoza@empresa.com', 
    'Vendedor', 
    (SELECT id FROM public.departamentos WHERE nombre = 'Ventas'),
    '2021-06-01', 
    'activo'
),
(
    'Ana Sofía', 
    'Torres López', 
    'DNI', 
    '78912345', 
    '1992-01-05', 
    'Av. Brasil 321, Lima', 
    '987456789', 
    'ana.torres@empresa.com', 
    'Desarrolladora de Software', 
    (SELECT id FROM public.departamentos WHERE nombre = 'Sistemas'),
    '2022-02-15', 
    'activo'
); 