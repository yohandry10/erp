'use client'

interface UsersStatsProps {
  stats: {
    totalUsuarios: number
    usuariosActivos: number
    usuariosInactivos: number
    totalRoles: number
  }
}

export default function UsersStats({ stats }: UsersStatsProps) {
  return (
    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
      <div className="stat-card">
        <div className="stat-header">
          <h3>USUARIOS TOTALES</h3>
          <span className="stat-icon">👥</span>
        </div>
        <div className="stat-value">{stats.totalUsuarios}</div>
        <div className="stat-subtitle">Usuarios registrados</div>
      </div>

      <div className="stat-card">
        <div className="stat-header">
          <h3>USUARIOS ACTIVOS</h3>
          <span className="stat-icon">✅</span>
        </div>
        <div className="stat-value">{stats.usuariosActivos}</div>
        <div className="stat-subtitle">Activos en el sistema</div>
      </div>

      <div className="stat-card">
        <div className="stat-header">
          <h3>ROLES DEFINIDOS</h3>
          <span className="stat-icon">🔑</span>
        </div>
        <div className="stat-value">{stats.totalRoles}</div>
        <div className="stat-subtitle">Roles configurados</div>
      </div>

      <div className="stat-card alert">
        <div className="stat-header">
          <h3>INACTIVOS</h3>
          <span className="stat-icon">⚠️</span>
        </div>
        <div className="stat-value warning">{stats.usuariosInactivos}</div>
        <div className="stat-subtitle">Usuarios inactivos</div>
      </div>
    </div>
  )
}
