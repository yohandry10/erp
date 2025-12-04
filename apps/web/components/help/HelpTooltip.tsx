'use client'

import { HelpItem, TooltipPosition } from './types'

interface HelpTooltipContentProps {
  content: HelpItem
  position?: TooltipPosition
}

export function HelpTooltipContent({ content, position = 'top' }: HelpTooltipContentProps) {
  const getPositionStyles = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      zIndex: 50,
      width: '256px',
      padding: '12px',
      fontSize: '14px',
      backgroundColor: '#1e293b',
      color: 'white',
      borderRadius: '8px',
      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      opacity: 0,
      visibility: 'hidden' as const,
      transition: 'all 0.2s ease-out',
      pointerEvents: 'none' as const,
    }

    switch (position) {
      case 'top':
        return { ...base, bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px' }
      case 'bottom':
        return { ...base, top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '8px' }
      case 'left':
        return { ...base, right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '8px' }
      case 'right':
        return { ...base, left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '8px' }
      default:
        return base
    }
  }

  return (
    <div
      role="tooltip"
      className="help-tooltip-content"
      style={getPositionStyles()}
    >
      <p style={{ fontWeight: 600, color: 'white', marginBottom: '4px', margin: 0 }}>
        {content.title}
      </p>
      <p style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.5, margin: 0 }}>
        {content.description}
      </p>
      {content.tips && content.tips.length > 0 && (
        <ul style={{ marginTop: '8px', paddingLeft: 0, listStyle: 'none' }}>
          {content.tips.map((tip, index) => (
            <li key={index} style={{ 
              fontSize: '12px', 
              color: '#94a3b8', 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: '4px',
              marginBottom: '4px'
            }}>
              <span style={{ color: '#3b82f6', marginTop: '2px' }}>•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      )}
      <style jsx global>{`
        .help-icon-wrapper:hover .help-tooltip-content {
          opacity: 1 !important;
          visibility: visible !important;
        }
      `}</style>
    </div>
  )
}
