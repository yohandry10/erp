'use client';
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardNav = DashboardNav;
const react_1 = require("react");
const link_1 = __importDefault(require("next/link"));
const navigation_1 = require("next/navigation");
const auth_helpers_nextjs_1 = require("@supabase/auth-helpers-nextjs");
const button_1 = require("@/components/ui/button");
const use_toast_1 = require("@/components/ui/use-toast");
const lucide_react_1 = require("lucide-react");
const navigation = [
    {
        name: 'Dashboard',
        href: '/dashboard',
        icon: lucide_react_1.Building2,
    },
    {
        name: 'CPE',
        href: '/dashboard/cpe',
        icon: lucide_react_1.FileText,
    },
    {
        name: 'GRE',
        href: '/dashboard/gre',
        icon: lucide_react_1.Truck,
    },
    {
        name: 'SIRE',
        href: '/dashboard/sire',
        icon: lucide_react_1.Download,
    },
    {
        name: 'Inventario',
        href: '/dashboard/inventario',
        icon: lucide_react_1.Package,
    },
    {
        name: 'Compras',
        href: '/dashboard/compras',
        icon: lucide_react_1.ShoppingCart,
    },
    {
        name: 'Cotizaciones',
        href: '/dashboard/cotizaciones',
        icon: lucide_react_1.FileSpreadsheet,
    },
];
const navStyles = {
    nav: {
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: 'var(--shadow-lg)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
    },
    container: {
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '0 2rem',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        height: '4rem',
    },
    leftSection: {
        display: 'flex',
        alignItems: 'center',
    },
    logo: {
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
    },
    logoText: {
        marginLeft: '0.75rem',
        fontSize: '1.25rem',
        fontWeight: '800',
        background: 'var(--gradient-primary)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
    },
    navLinks: {
        display: 'none',
        marginLeft: '2rem',
        gap: '0.5rem',
    },
    navLink: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.75rem 1.5rem',
        borderBottom: '2px solid transparent',
        fontSize: '0.9rem',
        fontWeight: '600',
        textDecoration: 'none',
        transition: 'all 0.3s ease',
        borderRadius: 'var(--border-radius) var(--border-radius) 0 0',
    },
    navLinkActive: {
        borderBottomColor: 'var(--blue-600)',
        color: 'var(--blue-600)',
        background: 'rgba(59, 130, 246, 0.05)',
    },
    navLinkInactive: {
        color: 'var(--primary-600)',
    },
    rightSection: {
        display: 'none',
        alignItems: 'center',
        marginLeft: '2rem',
    },
    mobileButton: {
        display: 'flex',
        alignItems: 'center',
    },
    mobileMenu: {
        display: 'block',
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.3)',
    },
    mobileMenuContainer: {
        padding: '1rem 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
    },
    mobileNavLink: {
        display: 'block',
        padding: '1rem 1.5rem',
        borderLeft: '4px solid transparent',
        fontSize: '1rem',
        fontWeight: '600',
        textDecoration: 'none',
        transition: 'all 0.3s ease',
    },
    mobileNavLinkActive: {
        background: 'rgba(59, 130, 246, 0.1)',
        borderLeftColor: 'var(--blue-600)',
        color: 'var(--blue-600)',
    },
    mobileNavLinkInactive: {
        color: 'var(--primary-600)',
    },
    iconContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
    },
};
// Media queries para responsive design
const mediaQueries = {
    desktop: '@media (min-width: 640px)',
};
function DashboardNav() {
    const [mobileMenuOpen, setMobileMenuOpen] = (0, react_1.useState)(false);
    const pathname = (0, navigation_1.usePathname)();
    const router = (0, navigation_1.useRouter)();
    const supabase = (0, auth_helpers_nextjs_1.createClientComponentClient)();
    const { toast } = (0, use_toast_1.useToast)();
    const handleLogout = async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "No se pudo cerrar sesión",
                });
            }
            else {
                toast({
                    title: "Sesión cerrada",
                    description: "Has cerrado sesión exitosamente",
                });
                router.push('/login');
            }
        }
        catch (error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Ocurrió un error inesperado",
            });
        }
    };
    return (<>
      <nav style={navStyles.nav}>
        <div style={navStyles.container}>
          <div style={navStyles.header}>
            <div style={navStyles.leftSection}>
              {/* Logo */}
              <div style={navStyles.logo}>
                <lucide_react_1.Building2 style={{ height: '2rem', width: '2rem', color: 'var(--blue-600)' }}/>
                <span style={navStyles.logoText}>
                  ERP Suite
                </span>
              </div>

              {/* Desktop Navigation */}
              <div style={{ ...navStyles.navLinks, display: window.innerWidth >= 640 ? 'flex' : 'none' }}>
                {navigation.map((item) => {
            const isActive = pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (<link_1.default key={item.name} href={item.href} style={{
                    ...navStyles.navLink,
                    ...(isActive ? navStyles.navLinkActive : navStyles.navLinkInactive),
                }}>
                      <item.icon style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }}/>
                      {item.name}
                    </link_1.default>);
        })}
              </div>
            </div>

            {/* Desktop Logout */}
            <div style={{ ...navStyles.rightSection, display: window.innerWidth >= 640 ? 'flex' : 'none' }}>
              <button_1.Button variant="ghost" size="sm" onClick={handleLogout} style={{ display: 'inline-flex', alignItems: 'center' }}>
                <lucide_react_1.LogOut style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }}/>
                Cerrar Sesión
              </button_1.Button>
            </div>

            {/* Mobile menu button */}
            <div style={{ ...navStyles.mobileButton, display: window.innerWidth < 640 ? 'flex' : 'none' }}>
              <button_1.Button variant="ghost" size="sm" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? (<lucide_react_1.X style={{ height: '1.5rem', width: '1.5rem' }}/>) : (<lucide_react_1.Menu style={{ height: '1.5rem', width: '1.5rem' }}/>)}
              </button_1.Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (<div style={navStyles.mobileMenu}>
            <div style={navStyles.mobileMenuContainer}>
              {navigation.map((item) => {
                const isActive = pathname === item.href ||
                    (item.href !== '/dashboard' && pathname.startsWith(item.href));
                return (<link_1.default key={item.name} href={item.href} style={{
                        ...navStyles.mobileNavLink,
                        ...(isActive ? navStyles.mobileNavLinkActive : navStyles.mobileNavLinkInactive),
                    }} onClick={() => setMobileMenuOpen(false)}>
                    <div style={navStyles.iconContainer}>
                      <item.icon style={{ width: '1.25rem', height: '1.25rem' }}/>
                      {item.name}
                    </div>
                  </link_1.default>);
            })}
              
              {/* Mobile Logout */}
              <button onClick={handleLogout} style={{
                ...navStyles.mobileNavLink,
                ...navStyles.mobileNavLinkInactive,
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
            }}>
                <div style={navStyles.iconContainer}>
                  <lucide_react_1.LogOut style={{ width: '1.25rem', height: '1.25rem' }}/>
                  Cerrar Sesión
                </div>
              </button>
            </div>
          </div>)}
      </nav>

      <style jsx>{`
        @media (min-width: 640px) {
          .desktop-nav {
            display: flex !important;
          }
          .desktop-logout {
            display: flex !important;
          }
          .mobile-button {
            display: none !important;
          }
        }
        @media (max-width: 639px) {
          .desktop-nav {
            display: none !important;
          }
          .desktop-logout {
            display: none !important;
          }
          .mobile-button {
            display: flex !important;
          }
        }
      `}</style>
    </>);
}
