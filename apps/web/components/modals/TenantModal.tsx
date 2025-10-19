'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { Separator } from "@/components/ui/separator"

interface TenantModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  tenant?: any
}

const COUNTRIES = [
  { code: 'PE', name: 'Perú', currency: 'PEN' },
  { code: 'CO', name: 'Colombia', currency: 'COP' },
  { code: 'CL', name: 'Chile', currency: 'CLP' },
  { code: 'AR', name: 'Argentina', currency: 'ARS' },
  { code: 'MX', name: 'México', currency: 'MXN' },
  { code: 'EC', name: 'Ecuador', currency: 'USD' },
  { code: 'BO', name: 'Bolivia', currency: 'BOB' },
]

const CURRENCIES = [
  { code: 'PEN', name: 'Sol Peruano (PEN)', symbol: 'S/' },
  { code: 'USD', name: 'Dólar Americano (USD)', symbol: '$' },
  { code: 'COP', name: 'Peso Colombiano (COP)', symbol: '$' },
  { code: 'CLP', name: 'Peso Chileno (CLP)', symbol: '$' },
  { code: 'ARS', name: 'Peso A