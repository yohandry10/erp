'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { PageShell } from '@/components/erp/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Save, X, Tag, GripVertical } from 'lucide-react'

type CampoExtra = {
  key: string
  label: string
  tipo: 'text' | 'number' | 'date' | 'select'
  requerido: boolean
  opciones?: string[]
}

type Categoria = {
  id: string
  nombre: string
  codigo: string | null
  descripcion: string | null
  campos_extra: CampoExtra[]
  activo: boolean
  orden: number
}

type FormData = {
  nombre: string
  codigo: string
  descripcion: string
  campos_extra: CampoExtra[]
}

const EMPTY_FORM: FormData = {
  nombre: '',
  codigo: '',
  descripcion: '',
  campos_extra: [],
}

const EMPTY_CAMPO: CampoExtra = {
  key: '',
  label: '',
  tipo: 'text',
  requerido: false,
  opciones: [],
}

function CampoExtraEditor({
  campos,
  onChange,
}: {
  campos: CampoExtra[]
  onChange: (campos: CampoExtra[]) => void
}) {
  const addCampo = () => {
    onChange([...campos, { ...EMPTY_CAMPO, key: `campo_${Date.now()}` }])
  }

  const updateCampo = (index: number, updates: Partial<CampoExtra>) => {
    const next = campos.map((c, i) => (i === index ? { ...c, ...updates } : c))
    onChange(next)
  }

  const removeCampo = (index: number) => {
    onChange(campos.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground/85">
          Campos adicionales por categoría
        </h4>
        <Button type="button" size="sm" variant="outline" onClick={addCampo} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Agregar campo
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Define qué atributos extra pedir cuando un producto pertenece a esta categoría (ej: Talla, Color, Lote, Vencimiento).
      </p>

      {campos.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/50 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Sin campos adicionales. Los productos de esta categoría usarán solo los campos base.
        </div>
      )}

      {campos.map((campo, index) => (
        <div
          key={index}
          className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/80 p-4 md:flex-row md:items-end"
        >
          <GripVertical className="hidden h-5 w-5 shrink-0 text-muted-foreground/40 md:block" />

          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Nombre del campo</label>
            <Input
              value={campo.label}
              onChange={(e) => {
                const label = e.target.value
                const key = label
                  .toLowerCase()
                  .replace(/\s+/g, '_')
                  .replace(/[^a-z0-9_]/g, '')
                updateCampo(index, { label, key })
              }}
              placeholder="Ej: Talla, Color, Lote"
              className="h-9"
            />
          </div>

          <div className="w-full space-y-1 md:w-36">
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <select
              value={campo.tipo}
              onChange={(e) => updateCampo(index, { tipo: e.target.value as CampoExtra['tipo'] })}
              className="h-9 w-full rounded-md border border-border bg-card px-2.5 text-sm"
            >
              <option value="text">Texto</option>
              <option value="number">Número</option>
              <option value="date">Fecha</option>
              <option value="select">Lista</option>
            </select>
          </div>

          {campo.tipo === 'select' && (
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Opciones (separadas por coma)
              </label>
              <Input
                value={campo.opciones?.join(', ') ?? ''}
                onChange={(e) =>
                  updateCampo(index, {
                    opciones: e.target.value
                      .split(',')
                      .map((o) => o.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Ej: XS, S, M, L, XL"
                className="h-9"
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={campo.requerido}
              onChange={(e) => updateCampo(index, { requerido: e.target.checked })}
            />
            Requerido
          </label>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeCampo(index)}
            className="h-9 w-9 shrink-0 p-0 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}

function CategoriaForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: FormData
  onSave: (data: FormData) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<FormData>(initial)

  return (
    <div className="space-y-4 rounded-2xl border border-primary/20 bg-card/80 p-6 shadow-lg">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground/85">
            Nombre <span className="text-destructive">*</span>
          </label>
          <Input
            value={form.nombre}
            onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
            placeholder="Ej: Electrónica"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground/85">Código</label>
          <Input
            value={form.codigo}
            onChange={(e) => setForm((prev) => ({ ...prev, codigo: e.target.value }))}
            placeholder="Ej: ELEC"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground/85">Descripción</label>
          <Input
            value={form.descripcion}
            onChange={(e) => setForm((prev) => ({ ...prev, descripcion: e.target.value }))}
            placeholder="Descripción breve"
          />
        </div>
      </div>

      <CampoExtraEditor
        campos={form.campos_extra}
        onChange={(campos_extra) => setForm((prev) => ({ ...prev, campos_extra }))}
      />

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          <X className="mr-1.5 h-4 w-4" /> Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => onSave(form)}
          disabled={saving || !form.nombre.trim()}
        >
          <Save className="mr-1.5 h-4 w-4" /> {saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}

function CategoriasContent() {
  const { get, post, put, del } = useApi()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await get('/inventario/categorias')
      if (resp?.success && Array.isArray(resp.data)) {
        setCategorias(
          resp.data.map((c: any) => ({
            id: c.id,
            nombre: c.nombre ?? '',
            codigo: c.codigo ?? null,
            descripcion: c.descripcion ?? null,
            campos_extra: Array.isArray(c.campos_extra) ? c.campos_extra : [],
            activo: c.activo !== false,
            orden: c.orden ?? 0,
          })),
        )
      }
    } catch {
      setError('No se pudieron cargar las categorías.')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async (data: FormData) => {
    setSaving(true)
    try {
      const resp = await post('/inventario/categorias', data)
      if (resp?.success) {
        setCreating(false)
        await load()
      } else {
        setError(resp?.message || 'Error al crear la categoría.')
      }
    } catch {
      setError('Error al crear la categoría.')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (data: FormData) => {
    if (!editingId) return
    setSaving(true)
    try {
      const resp = await put(`/inventario/categorias/${editingId}`, data)
      if (resp?.success) {
        setEditingId(null)
        await load()
      } else {
        setError(resp?.message || 'Error al actualizar la categoría.')
      }
    } catch {
      setError('Error al actualizar la categoría.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar la categoría "${nombre}"? Los productos con esta categoría no se verán afectados.`))
      return
    try {
      const resp = await del(`/inventario/categorias/${id}`)
      if (resp?.success) {
        await load()
      } else {
        setError(resp?.message || 'Error al eliminar la categoría.')
      }
    } catch {
      setError('Error al eliminar la categoría.')
    }
  }

  const editingCategoria = useMemo(
    () => categorias.find((c) => c.id === editingId),
    [categorias, editingId],
  )

  if (loading) {
    return (
      <div className="grid min-h-[320px] place-items-center rounded-3xl border border-cyan-400/20 bg-card/60 shadow-xl">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-cyan-300/20 border-t-cyan-300" />
          <p className="text-sm font-semibold">Cargando categorías...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm font-semibold text-amber-700 dark:text-amber-200">
          {error}
        </div>
      )}

      {/* Crear nueva */}
      {creating ? (
        <CategoriaForm
          initial={EMPTY_FORM}
          onSave={handleCreate}
          onCancel={() => setCreating(false)}
          saving={saving}
        />
      ) : (
        <Button onClick={() => { setCreating(true); setEditingId(null) }} className="gap-2">
          <Plus className="h-4 w-4" /> Nueva categoría
        </Button>
      )}

      {/* Editar existente */}
      {editingId && editingCategoria && (
        <CategoriaForm
          initial={{
            nombre: editingCategoria.nombre,
            codigo: editingCategoria.codigo ?? '',
            descripcion: editingCategoria.descripcion ?? '',
            campos_extra: editingCategoria.campos_extra,
          }}
          onSave={handleUpdate}
          onCancel={() => setEditingId(null)}
          saving={saving}
        />
      )}

      {/* Listado */}
      <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white group-data-[erp-theme=light]/dashboard:text-foreground">
            <Tag className="h-5 w-5 text-primary" /> Categorías de productos
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Gestiona las categorías y define qué campos adicionales se solicitan para cada tipo de producto.
          </p>
        </CardHeader>
        <CardContent>
          {categorias.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              No hay categorías configuradas. Crea una para empezar.
            </div>
          ) : (
            <div className="grid gap-3">
              {categorias
                .sort((a, b) => a.orden - b.orden)
                .map((cat) => (
                  <div
                    key={cat.id}
                    className="flex flex-col gap-3 rounded-2xl border border-cyan-400/15 bg-card/50 p-4 transition-colors hover:bg-card/70 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <strong className="text-foreground">{cat.nombre}</strong>
                        {cat.codigo && (
                          <Badge
                            variant="outline"
                            className="border-cyan-300/30 text-xs text-muted-foreground"
                          >
                            {cat.codigo}
                          </Badge>
                        )}
                        <Badge
                          className={
                            cat.activo
                              ? 'border-cyan-300/30 bg-cyan-300/10 text-primary'
                              : 'border-border/25 bg-slate-300/10 text-foreground/70'
                          }
                        >
                          {cat.activo ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </div>
                      {cat.descripcion && (
                        <p className="mt-1 text-xs text-muted-foreground">{cat.descripcion}</p>
                      )}
                      {cat.campos_extra.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {cat.campos_extra.map((campo) => (
                            <Badge
                              key={campo.key}
                              variant="secondary"
                              className="text-xs"
                            >
                              {campo.label}
                              {campo.requerido && ' *'}
                              <span className="ml-1 opacity-60">({campo.tipo})</span>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(cat.id)
                          setCreating(false)
                        }}
                        className="gap-1.5"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(cat.id, cat.nombre)}
                        className="gap-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Eliminar
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function CategoriasPage() {
  return (
    <PageShell
      title="Categorías de Productos"
      description="Administra las categorías y define campos específicos para cada tipo de producto (tecnología, ropa, farmacia, etc.)."
    >
      <ProtectedComponent
        modulo="inventario"
        recurso="productos"
        accion="read"
        fallback={
          <div className="rounded-2xl border border-cyan-400/20 bg-card/60 p-4 text-sm text-primary">
            Necesitas el permiso <code>inventario.productos.read</code> para gestionar categorías.
          </div>
        }
      >
        <CategoriasContent />
      </ProtectedComponent>
    </PageShell>
  )
}
