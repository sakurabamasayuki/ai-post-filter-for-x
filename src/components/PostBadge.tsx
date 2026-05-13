import React, { memo, useState } from 'react';

export const PostBadge = memo(({ score, reasons = [], onFeedback }: any) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const pct = Math.round(score * 100);
  
  const config = 
    score >= 0.7 ? { color: '#ef4444', label: 'AI likely' } :
    score >= 0.4 ? { color: '#f59e0b', label: 'Mixed' } :
    { color: '#10b981', label: 'Human' };

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <div 
        onClick={() => setShowTooltip(!showTooltip)}
        style={{
          backgroundColor: config.color,
          color: 'white',
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 'bold',
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          gap: '4px'
        }}
      >
        <span>{config.label}</span>
        <span style={{ opacity: 0.8 }}>{pct}%</span>
      </div>

      {showTooltip && (
        <div className="animate-fade-in" style={{
          position: 'absolute', top: '24px', left: '0', width: '200px',
          backgroundColor: '#15181c', border: '1px solid #333', color: 'white',
          padding: '10px', borderRadius: '8px', zIndex: 999, fontSize: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>判定シグナル:</div>
          <ul style={{ margin: 0, paddingLeft: '16px' }}>
            {reasons.length ? reasons.map((r: string, i: number) => <li key={i}>{r}</li>) : <li>AI特有のパターンを検出</li>}
          </ul>
          <div style={{ marginTop: '8px', borderTop: '1px solid #333', paddingTop: '8px', display: 'flex', gap: '8px' }}>
            <button onClick={() => onFeedback('human')} style={{ color: '#10b981', background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px' }}>誤判定(人)</button>
            <button onClick={() => onFeedback('ai')} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px' }}>誤判定(AI)</button>
          </div>
        </div>
      )}
    </div>
  );
});
