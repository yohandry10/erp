export interface ResumenRetencionesResponse {
    total_retenciones: number;
    monto_total_retenido: number;
    monto_total_pagado: number;
    monto_total_neto: number;
    retenciones_por_categoria: {
        CUARTA: {
            cantidad: number;
            monto_total_retenido: number;
            monto_total_pagado: number;
            tasa_promedio: number;
        };
        QUINTA: {
            cantidad: number;
            monto_total_retenido: number;
            monto_total_pagado: number;
            tasa_promedio: number;
        };
    };
    retenciones_por_estado: {
        PENDIENTE: number;
        PROCESADA: number;
        ANULADA: number;
    };
    periodo: {
        fecha_inicio: string;
        fecha_fin: string;
    };
    top_proveedores: {
        proveedor_id: string;
        razon_social: string;
        numero_documento: string;
        total_retenciones: number;
        monto_total_retenido: number;
    }[];
}
export interface ReporteRetencionesDto {
    tipo_reporte: 'MENSUAL' | 'TRIMESTRAL' | 'ANUAL' | 'PERSONALIZADO';
    fecha_inicio: string;
    fecha_fin: string;
    categoria_retencion?: 'CUARTA' | 'QUINTA';
    proveedor_id?: string;
    estado?: 'PENDIENTE' | 'PROCESADA' | 'ANULADA';
    formato_salida: 'PDF' | 'EXCEL' | 'JSON';
    incluir_detalles: boolean;
    agrupar_por?: 'PROVEEDOR' | 'CATEGORIA' | 'MES' | 'ESTADO';
}
export interface EstadisticasRetencionesResponse {
    resumen_general: ResumenRetencionesResponse;
    tendencias_mensuales: {
        mes: string;
        total_retenciones: number;
        monto_total_retenido: number;
        variacion_porcentual: number;
    }[];
    comparacion_categorias: {
        categoria: string;
        porcentaje_participacion: number;
        crecimiento_mensual: number;
    }[];
    alertas: {
        tipo: 'VENCIMIENTO' | 'MONTO_ALTO' | 'INCONSISTENCIA';
        mensaje: string;
        retencion_id?: string;
        fecha_alerta: string;
    }[];
}
export interface ConfiguracionRetencionesResponse {
    tasas_retencion: {
        CUARTA: number;
        QUINTA: number;
    };
    montos_minimos: {
        CUARTA: number;
        QUINTA: number;
    };
    exoneraciones_activas: {
        proveedor_id: string;
        razon_social: string;
        categoria: string;
        motivo: string;
        fecha_inicio: string;
        fecha_fin?: string;
    }[];
    configuracion_general: {
        auto_calcular: boolean;
        validar_duplicados: boolean;
        notificar_vencimientos: boolean;
        dias_alerta_vencimiento: number;
    };
}
