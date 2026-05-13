import React, { memo } from 'react';

export const BlurOverlay = memo(({ onShow }: any) => (
  <div style={{
    position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    zIndex: 10, borderRadius: '16px', color: 'white'
  }}>
    <p style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '14px' }}>AI生成の可能性が高い投稿です</p>
    <button 
      onClick={onShow}
      style={{
        background: 'rgba(255,255,255,0.2)', border: '1px solid white',
        color: 'white', padding: '6px 16px', borderRadius: '20px',
        cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
      }}
    >
      Show anyway
    </button>
  </div>
));
