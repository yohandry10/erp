'use client';
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Sidebar;
const link_1 = __importDefault(require("next/link"));
const navigation_1 = require("next/navigation");
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const menuItems = [
    {
        title: 'Dashboard',
        href: '/dashboard',
        icon: lucide_react_1.Building2
    },
    {
        title: '🛒 POS',
        href: '/dashboard/pos',
        icon: lucide_react_1.ShoppingCart
    },
    {
        title: '📄 Documentos',
        href: '/dashboard/documentos',
        icon: lucide_react_1.FileText
    },
    {
        title: '💼 Finanzas',
        href: '/dashboard/finanzas',
        icon: lucide_react_1.FileSpreadsheet
    },
    {
        title: '📊 Contabilidad',
        href: '/dashboard/contabilidad',
        icon: lucide_react_1.FileText
    },
    {
        title: '📈 Analytics',
        href: '/dashboard/analytics',
        icon: lucide_react_1.Download
    },
    {
        title: 'Inventario',
        href: '/dashboard/inventario',
        icon: lucide_react_1.Package
    },
    {
        title: 'CPE',
        href: '/dashboard/cpe',
        icon: lucide_react_1.FileText
    },
    {
        title: 'GRE',
        href: '/dashboard/gre',
        icon: lucide_react_1.Truck
    },
    {
        title: 'Reportes SIRE',
        href: '/dashboard/sire',
        icon: lucide_react_1.Download
    },
    {
        title: 'Compras',
        href: '/dashboard/compras',
        icon: lucide_react_1.ShoppingCart
    },
    {
        title: 'Cotizaciones',
        href: '/dashboard/cotizaciones',
        icon: lucide_react_1.FileSpreadsheet
    },
    {
        title: 'Usuarios',
        href: '/dashboard/usuarios',
        icon: lucide_react_1.Users
    },
    {
        title: 'RRHH',
        href: '/dashboard/rrhh',
        icon: lucide_react_1.Users
    },
    {
        title: 'Configuración',
        href: '/dashboard/configuracion',
        icon: lucide_react_1.Settings
    }
];
function Sidebar() {
    const pathname = (0, navigation_1.usePathname)();
    const [isOpen, setIsOpen] = (0, react_1.useState)(false);
    return (<>
      {/* Mobile menu button */}
      <button className="mobile-menu-btn" onClick={() => setIsOpen(!isOpen)} style={{
            position: 'fixed',
            top: '1rem',
            left: '1rem',
            zIndex: 1001,
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
            backdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '12px',
            padding: '0.75rem',
            cursor: 'pointer',
            display: 'none',
            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)'
        }}>
        {isOpen ? <lucide_react_1.X size={20} style={{ color: '#475569' }}/> : <lucide_react_1.Menu size={20} style={{ color: '#475569' }}/>}
      </button>

      {/* Sidebar */}
      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`} style={{
            position: 'fixed',
            left: 0,
            top: 0,
            height: '100vh',
            width: '280px',
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
            backdropFilter: 'blur(20px) saturate(180%)',
            borderRight: '1px solid rgba(255, 255, 255, 0.3)',
            padding: '2rem 0',
            overflowY: 'auto',
            zIndex: 1000,
            transition: 'transform 0.3s ease',
            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
        }}>
        {/* Logo */}
        <div style={{ padding: '0 2rem 2rem 2rem', borderBottom: '1px solid rgba(203, 213, 225, 0.3)' }}>
          <link_1.default href="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            <lucide_react_1.Building2 size={32} style={{ marginRight: '0.75rem', color: '#3b82f6' }}/>
            <div>
              <h1 style={{
            fontSize: '1.5rem',
            fontWeight: '800',
            margin: 0,
            background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.025em'
        }}>
                CABIMAS ERP
              </h1>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0, fontWeight: '500' }}>
                Sistema Empresarial
              </p>
            </div>
          </link_1.default>
        </div>

        {/* Navigation */}
        <nav style={{ padding: '2rem 1rem' }}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (<link_1.default key={item.href} href={item.href} className={`nav-item ${isActive ? 'active' : ''}`} style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '1rem 1.5rem',
                    margin: '0.25rem 0',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    color: isActive ? 'white' : '#475569',
                    fontWeight: isActive ? '700' : '600',
                    fontSize: '0.9rem',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    background: isActive ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)' : 'transparent',
                    boxShadow: isActive ? '0 10px 20px rgba(59, 130, 246, 0.3)' : 'none',
                    transform: isActive ? 'translateY(-1px) scale(1.02)' : 'none',
                    border: isActive ? 'none' : '1px solid transparent'
                }} onMouseEnter={(e) => {
                    if (!isActive) {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(14, 165, 233, 0.05) 100%)';
                        e.currentTarget.style.transform = 'translateX(6px) scale(1.01)';
                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.2)';
                        e.currentTarget.style.color = '#2563eb';
                    }
                }} onMouseLeave={(e) => {
                    if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.transform = 'translateX(0) scale(1)';
                        e.currentTarget.style.borderColor = 'transparent';
                        e.currentTarget.style.color = '#475569';
                    }
                }}>
                <Icon size={20} style={{ marginRight: '0.75rem' }}/>
                {item.title}
              </link_1.default>);
        })}
        </nav>

        {/* User Section */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '1rem', borderTop: '1px solid rgba(203, 213, 225, 0.3)' }}>
          <div style={{
            padding: '1rem',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(14, 165, 233, 0.05) 100%)',
            borderRadius: '12px',
            marginBottom: '1rem',
            border: '1px solid rgba(59, 130, 246, 0.2)'
        }}>
            <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>Admin Kame</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '500' }}>admin@kame.demo</div>
          </div>
          
          <button style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            padding: '0.75rem 1rem',
            background: 'transparent',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#dc2626',
            fontSize: '0.9rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%)';
            e.currentTarget.style.transform = 'translateY(-1px)';
        }} onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.transform = 'translateY(0)';
        }}>
            <lucide_react_1.LogOut size={18} style={{ marginRight: '0.5rem' }}/>
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isOpen && (<div style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                zIndex: 999,
                display: 'none'
            }} onClick={() => setIsOpen(false)}/>)}

      <style jsx>{`
        @media (max-width: 768px) {
          .mobile-menu-btn {
            display: block !important;
          }
          
          .sidebar {
            transform: translateX(-100%);
          }
          
          .sidebar-open {
            transform: translateX(0);
          }
          
          .sidebar + div {
            display: block !important;
          }
        }
      `}</style>
    </>);
}
