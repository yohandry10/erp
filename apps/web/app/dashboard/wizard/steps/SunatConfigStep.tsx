'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, BookOpenCheck, Building2, KeyRound, PlugZap, Truck } from 'lucide-react'

import { useWizardContext } from '../WizardContext'
import { useCountryContext } from '@/hooks/use-country-context'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const fieldGridClass = 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'
const labelClass = 'mb-2 block text-sm font-semibold text-primary'
const requiredClass = 'text-primary'
const inputClass = 'border-cyan-400/20 bg-card/70 text-foreground placeholder:text-muted-foreground focus:border-cyan-300 focus:ring-cyan-400/10'

function InfoPanel({
  tone = 'cyan',
  title,
  description,
}: {
  tone?: 'cyan' | 'blue' | 'slate'
  title: string
  description: string
}) {
  const toneClass = {
    cyan: 'border-cyan-400/20 bg-cyan-400/10 text-primary',
    blue: 'border-blue-400/20 bg-blue-500/10 text-primary dark:text-blue-200',
    slate: 'border-border/20 bg-slate-500/10 text-foreground',
  }[tone]

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${toneClass}`}>
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm opacity-80">{description}</p>
      </div>
    </div>
  )
}

export function SunatConfigStep() {
  const { state, updateConfiguration } = useWizardContext()
  const country = useCountryContext()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const emisionModo = state.configuration.emision_cpe_modo || (country.paisCodigo === 'CO' ? 'DIAN_DIRECTO' : 'SUNAT_DIRECTO')
  const authTipo = state.configuration.ose_auth_tipo || 'BASIC'
  const isOseApi = emisionModo === 'OSE_API'
  const isColombia = country.paisCodigo === 'CO'
  const isPeru = country.paisCodigo === 'PE'
  const isArgentina = country.paisCodigo === 'AR'
  const oseLabel = 'OSE'
  const dianEnvironment = state.configuration.dian_environment || 'HOMOLOGACION'
  const dianEndpoint = dianEnvironment === 'PRODUCCION'
    ? 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc'
    : 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc'
  const sunatEnvironment = state.configuration.sunat_environment || 'homologacion'
  const greTransport = state.configuration.sunat_gre_transport || 'soap'
  const sireActivo = state.configuration.sire_activo !== false

  const handleEmisionModoChange = (value: 'SUNAT_DIRECTO' | 'OSE_API' | 'ARCA_WSFE' | 'DIAN_DIRECTO') => {
    updateConfiguration({
      emision_cpe_modo: value,
      ose_activo: value === 'OSE_API',
    })
  }

  const handleAuthTipoChange = (value: 'BASIC' | 'BEARER' | 'API_KEY' | 'NONE') => {
    updateConfiguration({ ose_auth_tipo: value })
  }

  useEffect(() => {
    if (isOseApi && !state.configuration.ose_activo) {
      updateConfiguration({ ose_activo: true })
    }
  }, [isOseApi, state.configuration.ose_activo, updateConfiguration])

  useEffect(() => {
    if (isColombia && (
      !state.configuration.dian_activo
      || state.configuration.emision_cpe_modo !== 'DIAN_DIRECTO'
      || state.configuration.dian_url !== dianEndpoint
    )) {
      updateConfiguration({
        dian_activo: true,
        emision_cpe_modo: 'DIAN_DIRECTO',
        dian_url: dianEndpoint,
      })
    }
  }, [
    dianEndpoint,
    isColombia,
    state.configuration.dian_activo,
    state.configuration.dian_url,
    state.configuration.emision_cpe_modo,
    updateConfiguration,
  ])

  useEffect(() => {
    if (isPeru && !state.configuration.sunat_gre_rest_base_url) {
      updateConfiguration({ sunat_gre_rest_base_url: 'https://api-cpe.sunat.gob.pe/v1' })
    }
  }, [isPeru, state.configuration.sunat_gre_rest_base_url, updateConfiguration])

  useEffect(() => {
    if (!isArgentina) return
    const production = state.configuration.arca_environment === 'produccion'
    updateConfiguration({
      emision_cpe_modo: 'ARCA_WSFE',
      arca_wsaa_url: state.configuration.arca_wsaa_url || (production
        ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
        : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms'),
      arca_wsfe_url: state.configuration.arca_wsfe_url || (production
        ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
        : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'),
      arca_cuit_representada: state.configuration.arca_cuit_representada || state.configuration.ruc,
    })
  }, [
    isArgentina,
    state.configuration.arca_cuit_representada,
    state.configuration.arca_environment,
    state.configuration.arca_wsaa_url,
    state.configuration.arca_wsfe_url,
    state.configuration.ruc,
    updateConfiguration,
  ])

  return (
    <div className="space-y-5 py-2 text-foreground">
      <InfoPanel
        title="Autoridad fiscal"
        description={isArgentina
          ? 'Configura la autenticación WSAA, autorización WSFEv1, punto de venta y datos registrales de ARCA.'
          : isColombia
            ? 'Configura el software habilitado, certificado, resolución de numeración y ambiente de facturación electrónica DIAN.'
            : `Define como se enviaran los comprobantes: ${country.servicioFiscal} directo (SOAP) o API externa (${oseLabel} o propia).`}
      />

      <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
        <CardHeader className="border-b border-cyan-400/10">
          <CardTitle className="flex items-center gap-2 text-lg text-white">
            <Building2 className="h-5 w-5 text-primary" />
            Modo de emision
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div>
            <Label htmlFor="emision_modo" className={labelClass}>
              Selecciona el modo de envio
            </Label>
            <Select
              value={isArgentina ? 'ARCA_WSFE' : isColombia ? 'DIAN_DIRECTO' : emisionModo}
              onValueChange={(value) => handleEmisionModoChange(value as 'SUNAT_DIRECTO' | 'OSE_API' | 'ARCA_WSFE' | 'DIAN_DIRECTO')}
            >
              <SelectTrigger id="emision_modo" className={inputClass}>
                <SelectValue placeholder="Selecciona un modo" />
              </SelectTrigger>
              <SelectContent>
                {isArgentina ? (
                  <SelectItem value="ARCA_WSFE">ARCA directo (WSAA + WSFEv1)</SelectItem>
                ) : isColombia ? (
                  <SelectItem value="DIAN_DIRECTO">DIAN directo (pendiente de homologación)</SelectItem>
                ) : (
                  <>
                    <SelectItem value="SUNAT_DIRECTO">{country.servicioFiscal} directo (SOAP)</SelectItem>
                    <SelectItem value="OSE_API">{oseLabel} API (REST)</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {!isOseApi ? (
            <InfoPanel
              title={isColombia ? 'DIAN directo pendiente de homologación' : `${country.servicioFiscal} directo activo`}
              description={isColombia
                ? 'Puedes guardar los datos reales del contribuyente, pero el envío permanece bloqueado hasta validar UBL/CUFE/XAdES, superar el set de pruebas y habilitar el transporte SOAP oficial.'
                : `Se usaran las credenciales propias del contribuyente y los endpoints oficiales configurados para ${country.servicioFiscal}.`}
            />
          ) : null}
        </CardContent>
      </Card>

      {isArgentina ? (
        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10">
            <CardTitle className="flex items-center gap-2 text-lg text-white">
              <KeyRound className="h-5 w-5 text-primary" />
              Configuración ARCA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            <InfoPanel
              tone="blue"
              title="Certificado y relaciones"
              description="El certificado X.509 cargado en el paso anterior debe estar emitido por ARCA y asociado al servicio wsfe para el CUIT representado."
            />
            <div className={fieldGridClass}>
              <div>
                <Label htmlFor="arca_environment" className={labelClass}>Ambiente ARCA</Label>
                <Select
                  value={state.configuration.arca_environment || 'homologacion'}
                  onValueChange={(value) => {
                    const production = value === 'produccion'
                    updateConfiguration({
                      arca_environment: value as 'homologacion' | 'produccion',
                      arca_wsaa_url: production
                        ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
                        : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
                      arca_wsfe_url: production
                        ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
                        : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
                    })
                  }}
                >
                  <SelectTrigger id="arca_environment" className={inputClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homologacion">Homologación</SelectItem>
                    <SelectItem value="produccion">Producción</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="arca_cuit" className={labelClass}>CUIT representada <span className={requiredClass}>*</span></Label>
                <Input
                  id="arca_cuit"
                  inputMode="numeric"
                  maxLength={11}
                  value={state.configuration.arca_cuit_representada || state.configuration.ruc}
                  onChange={(event) => updateConfiguration({
                    arca_cuit_representada: event.target.value.replace(/\D/g, '').slice(0, 11),
                  })}
                  className={inputClass}
                />
              </div>
              <div>
                <Label htmlFor="arca_punto_venta" className={labelClass}>Punto de venta electrónico <span className={requiredClass}>*</span></Label>
                <Input
                  id="arca_punto_venta"
                  type="number"
                  min={1}
                  max={99998}
                  value={state.configuration.arca_punto_venta || 1}
                  onChange={(event) => updateConfiguration({ arca_punto_venta: Number(event.target.value) })}
                  className={inputClass}
                />
              </div>
              <div>
                <Label htmlFor="arca_condicion_iva" className={labelClass}>Condición frente al IVA <span className={requiredClass}>*</span></Label>
                <Select
                  value={state.configuration.arca_condicion_iva || 'RESPONSABLE_INSCRIPTO'}
                  onValueChange={(value) => updateConfiguration({ arca_condicion_iva: value as any })}
                >
                  <SelectTrigger id="arca_condicion_iva" className={inputClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</SelectItem>
                    <SelectItem value="MONOTRIBUTO">Monotributista</SelectItem>
                    <SelectItem value="EXENTO">Exento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ingresos_brutos" className={labelClass}>Ingresos Brutos / Convenio Multilateral <span className={requiredClass}>*</span></Label>
                <Input id="ingresos_brutos" value={state.configuration.ingresos_brutos || ''} onChange={(event) => updateConfiguration({ ingresos_brutos: event.target.value })} className={inputClass} />
              </div>
              <div>
                <Label htmlFor="provincia_fiscal" className={labelClass}>Jurisdicción fiscal <span className={requiredClass}>*</span></Label>
                <Input id="provincia_fiscal" value={state.configuration.provincia_fiscal || ''} onChange={(event) => updateConfiguration({ provincia_fiscal: event.target.value.toUpperCase() })} placeholder="CABA / BUENOS AIRES / ..." className={inputClass} />
              </div>
              <div>
                <Label htmlFor="fecha_inicio_actividades" className={labelClass}>Inicio de actividades <span className={requiredClass}>*</span></Label>
                <Input id="fecha_inicio_actividades" type="date" value={state.configuration.fecha_inicio_actividades || ''} onChange={(event) => updateConfiguration({ fecha_inicio_actividades: event.target.value })} className={inputClass} />
              </div>
            </div>
            <div className={fieldGridClass}>
              <div>
                <Label htmlFor="arca_wsaa_url" className={labelClass}>URL WSAA</Label>
                <Input id="arca_wsaa_url" type="url" value={state.configuration.arca_wsaa_url || ''} onChange={(event) => updateConfiguration({ arca_wsaa_url: event.target.value })} className={inputClass} />
              </div>
              <div>
                <Label htmlFor="arca_wsfe_url" className={labelClass}>URL WSFEv1</Label>
                <Input id="arca_wsfe_url" type="url" value={state.configuration.arca_wsfe_url || ''} onChange={(event) => updateConfiguration({ arca_wsfe_url: event.target.value })} className={inputClass} />
              </div>
            </div>
            <label className="flex items-center gap-3 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                checked={state.configuration.arca_activo === true}
                onChange={(event) => updateConfiguration({ arca_activo: event.target.checked })}
              />
              <span className="text-sm">Activar emisión real por WSFEv1 después de validar el certificado y el punto de venta.</span>
            </label>
          </CardContent>
        </Card>
      ) : null}

      {isPeru ? (
        <>
          <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10">
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <KeyRound className="h-5 w-5 text-primary" />
                Credenciales SUNAT
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <InfoPanel
                tone="blue"
                title="Clave SOL secundaria"
                description="Usa un usuario secundario SOL con permisos CPE/GRE; evita usar la clave principal del representante."
              />

              <div>
                <Label htmlFor="sunat_environment" className={labelClass}>
                  Ambiente SUNAT
                </Label>
                <Select
                  value={sunatEnvironment}
                  onValueChange={(value) => updateConfiguration({ sunat_environment: value as 'homologacion' | 'produccion' })}
                >
                  <SelectTrigger id="sunat_environment" className={inputClass}>
                    <SelectValue placeholder="Selecciona ambiente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homologacion">Homologacion</SelectItem>
                    <SelectItem value="produccion">Produccion</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className={fieldGridClass}>
                <div>
                  <Label htmlFor="sunat_username" className={labelClass}>
                    Usuario SOL secundario <span className={requiredClass}>*</span>
                  </Label>
                  <Input
                    id="sunat_username"
                    value={state.configuration.sunat_username || ''}
                    onChange={(e) => updateConfiguration({ sunat_username: e.target.value.toUpperCase() })}
                    placeholder="20600000000USUARIO"
                    className={inputClass}
                  />
                </div>
                <div>
                  <Label htmlFor="sunat_password" className={labelClass}>
                    Clave SOL secundaria <span className={requiredClass}>*</span>
                  </Label>
                  <Input
                    id="sunat_password"
                    type="password"
                    value={state.configuration.sunat_password || ''}
                    onChange={(e) => updateConfiguration({ sunat_password: e.target.value })}
                    placeholder="••••••••"
                    className={inputClass}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10">
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <BookOpenCheck className="h-5 w-5 text-primary" />
                SIRE — RVIE y RCE
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <InfoPanel
                tone="blue"
                title="Aceptación real, server-side y con ticket"
                description="El ERP aceptará la propuesta oficial y consultará el ticket hasta estado Terminado. La generación final del libro continúa en SUNAT Operaciones en Línea."
              />
              <label className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-card/70 p-4">
                <input
                  type="checkbox"
                  checked={sireActivo}
                  onChange={(event) => updateConfiguration({ sire_activo: event.target.checked })}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-semibold text-foreground">Habilitar SIRE para esta empresa peruana</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Requiere usuario SOL secundario y credenciales API SUNAT. Las demos y DEV nunca transmiten.</span>
                </span>
              </label>
            </CardContent>
          </Card>

          <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10">
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Truck className="h-5 w-5 text-primary" />
                GRE SUNAT
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <div>
                <Label htmlFor="sunat_gre_transport" className={labelClass}>
                  Transporte GRE
                </Label>
                <Select
                  value={greTransport}
                  onValueChange={(value) => updateConfiguration({ sunat_gre_transport: value as 'soap' | 'rest' })}
                >
                  <SelectTrigger id="sunat_gre_transport" className={inputClass}>
                    <SelectValue placeholder="Selecciona transporte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soap">SOAP SUNAT</SelectItem>
                    <SelectItem value="rest">GRE REST SUNAT</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {greTransport === 'rest' || sireActivo ? (
                <>
                  <InfoPanel
                    tone="slate"
                    title="Credenciales API SUNAT"
                    description="Se obtienen en Credenciales de API SUNAT y se usan server-side para SIRE y, si corresponde, GRE REST."
                  />
                  <div className={fieldGridClass}>
                    <div>
                      <Label htmlFor="sunat_gre_client_id" className={labelClass}>
                        Client ID API SUNAT <span className={requiredClass}>*</span>
                      </Label>
                      <Input
                        id="sunat_gre_client_id"
                        value={state.configuration.sunat_gre_client_id || ''}
                        onChange={(e) => updateConfiguration({ sunat_gre_client_id: e.target.value.trim() })}
                        placeholder="client_id"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <Label htmlFor="sunat_gre_client_secret" className={labelClass}>
                        Client secret API SUNAT <span className={requiredClass}>*</span>
                      </Label>
                      <Input
                        id="sunat_gre_client_secret"
                        type="password"
                        value={state.configuration.sunat_gre_client_secret || ''}
                        onChange={(e) => updateConfiguration({ sunat_gre_client_secret: e.target.value })}
                        placeholder="client_secret"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <Label htmlFor="sunat_gre_rest_base_url" className={labelClass}>
                        Base URL GRE REST
                      </Label>
                      <Input
                        id="sunat_gre_rest_base_url"
                        type="url"
                        value={state.configuration.sunat_gre_rest_base_url || ''}
                        onChange={(e) => updateConfiguration({ sunat_gre_rest_base_url: e.target.value })}
                        placeholder="https://api-cpe.sunat.gob.pe/v1"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <Label htmlFor="sunat_gre_auth_url" className={labelClass}>
                        URL OAuth opcional
                      </Label>
                      <Input
                        id="sunat_gre_auth_url"
                        type="url"
                        value={state.configuration.sunat_gre_auth_url || ''}
                        onChange={(e) => updateConfiguration({ sunat_gre_auth_url: e.target.value })}
                        placeholder="https://api-seguridad.sunat.gob.pe/v1/clientessol/{client_id}/oauth2/token/"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10">
              <CardTitle className="text-lg text-white">Endpoints SUNAT opcionales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <InfoPanel
                tone="slate"
                title="Defaults oficiales"
                description="Si dejas estos campos vacios, el backend usa los endpoints oficiales del ambiente seleccionado."
              />
              <div className={fieldGridClass}>
                <div>
                  <Label htmlFor="sunat_cpe_url" className={labelClass}>
                    URL CPE
                  </Label>
                  <Input id="sunat_cpe_url" type="url" value={state.configuration.sunat_cpe_url || ''} onChange={(e) => updateConfiguration({ sunat_cpe_url: e.target.value })} placeholder="https://e-beta.sunat.gob.pe/..." className={inputClass} />
                </div>
                <div>
                  <Label htmlFor="sunat_summary_url" className={labelClass}>
                    URL bajas/resumenes
                  </Label>
                  <Input id="sunat_summary_url" type="url" value={state.configuration.sunat_summary_url || ''} onChange={(e) => updateConfiguration({ sunat_summary_url: e.target.value })} placeholder="https://e-beta.sunat.gob.pe/..." className={inputClass} />
                </div>
                <div>
                  <Label htmlFor="sunat_query_url" className={labelClass}>
                    URL consulta CDR
                  </Label>
                  <Input id="sunat_query_url" type="url" value={state.configuration.sunat_query_url || ''} onChange={(e) => updateConfiguration({ sunat_query_url: e.target.value })} placeholder="https://e-factura.sunat.gob.pe/..." className={inputClass} />
                </div>
                <div>
                  <Label htmlFor="sunat_gre_url" className={labelClass}>
                    URL GRE SOAP
                  </Label>
                  <Input id="sunat_gre_url" type="url" value={state.configuration.sunat_gre_url || ''} onChange={(e) => updateConfiguration({ sunat_gre_url: e.target.value })} placeholder="https://e-beta.sunat.gob.pe/..." className={inputClass} />
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {isColombia ? (
        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10">
            <CardTitle className="text-lg text-white">Configuracion DIAN</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <InfoPanel
              tone="blue"
              title="Datos requeridos por DIAN"
              description="Esta informacion la entrega la DIAN o tu proveedor tecnologico autorizado."
            />

            <div>
              <Label htmlFor="dian_environment" className={labelClass}>
                Ambiente DIAN
              </Label>
              <Select
                value={dianEnvironment}
                onValueChange={(value) => updateConfiguration({ dian_environment: value as 'HOMOLOGACION' | 'PRODUCCION' })}
              >
                <SelectTrigger id="dian_environment" className={inputClass}>
                  <SelectValue placeholder="Selecciona ambiente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOMOLOGACION">Homologacion</SelectItem>
                  <SelectItem value="PRODUCCION">Produccion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="dian_url" className={labelClass}>
                URL DIAN <span className={requiredClass}>*</span>
              </Label>
              <Input
                id="dian_url"
                type="url"
                value={dianEndpoint}
                readOnly
                aria-readonly="true"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Se asigna automáticamente según el ambiente; no admite destinos personalizados.
              </p>
            </div>

            <div className={fieldGridClass}>
              <div>
                <Label htmlFor="dian_software_id" className={labelClass}>
                  Software ID <span className={requiredClass}>*</span>
                </Label>
                <Input id="dian_software_id" value={state.configuration.dian_software_id || ''} onChange={(e) => updateConfiguration({ dian_software_id: e.target.value })} placeholder="SoftwareId" className={inputClass} />
              </div>
              <div>
                <Label htmlFor="dian_software_pin" className={labelClass}>
                  Software PIN <span className={requiredClass}>*</span>
                </Label>
                <Input id="dian_software_pin" type="password" value={state.configuration.dian_software_pin || ''} onChange={(e) => updateConfiguration({ dian_software_pin: e.target.value })} placeholder="PIN" className={inputClass} />
              </div>
              {dianEnvironment === 'HOMOLOGACION' ? (
                <div>
                  <Label htmlFor="dian_test_set_id" className={labelClass}>
                    Test Set ID <span className={requiredClass}>*</span>
                  </Label>
                  <Input id="dian_test_set_id" value={state.configuration.dian_test_set_id || ''} onChange={(e) => updateConfiguration({ dian_test_set_id: e.target.value })} placeholder="TestSetId" className={inputClass} />
                </div>
              ) : null}
            </div>

            <div className={fieldGridClass}>
              <div>
                <Label htmlFor="dian_resolucion_numero" className={labelClass}>
                  Resolucion DIAN <span className={requiredClass}>*</span>
                </Label>
                <Input id="dian_resolucion_numero" value={state.configuration.dian_resolucion_numero || ''} onChange={(e) => updateConfiguration({ dian_resolucion_numero: e.target.value })} placeholder="18760000001" className={inputClass} />
              </div>
              <div>
                <Label htmlFor="dian_resolucion_prefijo" className={labelClass}>
                  Prefijo <span className={requiredClass}>*</span>
                </Label>
                <Input id="dian_resolucion_prefijo" value={state.configuration.dian_resolucion_prefijo || ''} onChange={(e) => updateConfiguration({ dian_resolucion_prefijo: e.target.value.toUpperCase() })} placeholder="FE" maxLength={4} className={inputClass} />
              </div>
              <div>
                <Label htmlFor="dian_resolucion_desde" className={labelClass}>
                  Desde <span className={requiredClass}>*</span>
                </Label>
                <Input id="dian_resolucion_desde" type="number" value={state.configuration.dian_resolucion_desde ?? ''} onChange={(e) => updateConfiguration({ dian_resolucion_desde: e.target.value ? parseInt(e.target.value, 10) : undefined })} placeholder="1" className={inputClass} />
              </div>
              <div>
                <Label htmlFor="dian_resolucion_hasta" className={labelClass}>
                  Hasta <span className={requiredClass}>*</span>
                </Label>
                <Input id="dian_resolucion_hasta" type="number" value={state.configuration.dian_resolucion_hasta ?? ''} onChange={(e) => updateConfiguration({ dian_resolucion_hasta: e.target.value ? parseInt(e.target.value, 10) : undefined })} placeholder="50000" className={inputClass} />
              </div>
              <div>
                <Label htmlFor="dian_resolucion_fecha_inicio" className={labelClass}>
                  Vigencia inicio <span className={requiredClass}>*</span>
                </Label>
                <Input id="dian_resolucion_fecha_inicio" type="date" value={state.configuration.dian_resolucion_fecha_inicio || ''} onChange={(e) => updateConfiguration({ dian_resolucion_fecha_inicio: e.target.value })} className={inputClass} />
              </div>
              <div>
                <Label htmlFor="dian_resolucion_fecha_fin" className={labelClass}>
                  Vigencia fin <span className={requiredClass}>*</span>
                </Label>
                <Input id="dian_resolucion_fecha_fin" type="date" value={state.configuration.dian_resolucion_fecha_fin || ''} onChange={(e) => updateConfiguration({ dian_resolucion_fecha_fin: e.target.value })} className={inputClass} />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isOseApi ? (
        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10">
            <CardTitle className="flex items-center gap-2 text-lg text-white">
              <PlugZap className="h-5 w-5 text-primary" />
              Configuracion {oseLabel} API
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <InfoPanel
              tone="slate"
              title={`${oseLabel} API lista para configurar`}
              description="La URL debe ser el endpoint exacto que indique tu proveedor o tu propia API."
            />

            <div>
              <Label htmlFor="ose_url" className={labelClass}>
                URL {oseLabel} API <span className={requiredClass}>*</span>
              </Label>
              <Input
                id="ose_url"
                type="url"
                value={state.configuration.ose_url || ''}
                onChange={(e) => {
                  updateConfiguration({ ose_url: e.target.value })
                  setErrors({ ...errors, ose_url: '' })
                }}
                placeholder="https://ose.ejemplo.com/api/enviar"
                className={inputClass}
              />
              {errors.ose_url ? <p className="mt-1 text-xs text-primary">{errors.ose_url}</p> : null}
            </div>

            <div>
              <Label htmlFor="ose_status_url" className={labelClass}>
                URL estado opcional
              </Label>
              <Input id="ose_status_url" type="url" value={state.configuration.ose_status_url || ''} onChange={(e) => updateConfiguration({ ose_status_url: e.target.value })} placeholder="https://ose.ejemplo.com/api/estado" className={inputClass} />
              <p className="mt-1 text-xs text-muted-foreground">Si no se define, se reutiliza la URL principal.</p>
            </div>

            <div>
              <Label htmlFor="ose_auth_tipo" className={labelClass}>
                Tipo de autenticacion
              </Label>
              <Select value={authTipo} onValueChange={(value) => handleAuthTipoChange(value as 'BASIC' | 'BEARER' | 'API_KEY' | 'NONE')}>
                <SelectTrigger id="ose_auth_tipo" className={inputClass}>
                  <SelectValue placeholder="Selecciona el tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BASIC">Basic</SelectItem>
                  <SelectItem value="BEARER">Bearer token</SelectItem>
                  <SelectItem value="API_KEY">API Key</SelectItem>
                  <SelectItem value="NONE">Sin autenticacion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {authTipo === 'BASIC' ? (
              <div className={fieldGridClass}>
                <div>
                  <Label htmlFor="ose_username" className={labelClass}>
                    Usuario {oseLabel} <span className={requiredClass}>*</span>
                  </Label>
                  <Input
                    id="ose_username"
                    value={state.configuration.ose_username || ''}
                    onChange={(e) => {
                      updateConfiguration({ ose_username: e.target.value })
                      setErrors({ ...errors, ose_username: '' })
                    }}
                    placeholder="usuario"
                    className={inputClass}
                  />
                  {errors.ose_username ? <p className="mt-1 text-xs text-primary">{errors.ose_username}</p> : null}
                </div>
                <div>
                  <Label htmlFor="ose_password" className={labelClass}>
                    Password {oseLabel} <span className={requiredClass}>*</span>
                  </Label>
                  <Input
                    id="ose_password"
                    type="password"
                    value={state.configuration.ose_password || ''}
                    onChange={(e) => {
                      updateConfiguration({ ose_password: e.target.value })
                      setErrors({ ...errors, ose_password: '' })
                    }}
                    placeholder="••••••••"
                    className={inputClass}
                  />
                  {errors.ose_password ? <p className="mt-1 text-xs text-primary">{errors.ose_password}</p> : null}
                </div>
              </div>
            ) : null}

            {authTipo === 'BEARER' ? (
              <div>
                <Label htmlFor="ose_bearer_token" className={labelClass}>
                  Bearer token <span className={requiredClass}>*</span>
                </Label>
                <Input id="ose_bearer_token" type="password" value={state.configuration.ose_bearer_token || ''} onChange={(e) => updateConfiguration({ ose_bearer_token: e.target.value })} placeholder="token" className={inputClass} />
              </div>
            ) : null}

            {authTipo === 'API_KEY' ? (
              <div className={fieldGridClass}>
                <div>
                  <Label htmlFor="ose_api_header" className={labelClass}>
                    Header API Key <span className={requiredClass}>*</span>
                  </Label>
                  <Input id="ose_api_header" value={state.configuration.ose_api_header || ''} onChange={(e) => updateConfiguration({ ose_api_header: e.target.value })} placeholder="x-api-key" className={inputClass} />
                </div>
                <div>
                  <Label htmlFor="ose_api_key" className={labelClass}>
                    API Key <span className={requiredClass}>*</span>
                  </Label>
                  <Input id="ose_api_key" type="password" value={state.configuration.ose_api_key || ''} onChange={(e) => updateConfiguration({ ose_api_key: e.target.value })} placeholder="clave" className={inputClass} />
                </div>
              </div>
            ) : null}

            {authTipo === 'NONE' ? <p className="text-sm text-muted-foreground">El {oseLabel} no requiere autenticacion adicional.</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
