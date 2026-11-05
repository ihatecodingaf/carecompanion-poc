/**
 * ClinicalHeatmap — displays the check-in photo with zone analysis badges.
 * Supports both face mode (ZoneAnalysis) and hair mode (HairZoneAnalysis).
 */

import React from 'react';
import type { ZoneAnalysis, HairZoneAnalysis } from '../lib/database.types';

const FACE_ZONE_LABELS: Record<string, string> = {
  forehead: 'Forehead',
  left_cheek: 'L. Cheek',
  right_cheek: 'R. Cheek',
  nose_tzone: 'T-Zone',
  perioral: 'Perioral',
  chin: 'Chin',
};

const HAIR_ZONE_LABELS: Record<string, string> = {
  crown: 'Crown',
  hairline: 'Hairline',
  left_temple: 'L. Temple',
  right_temple: 'R. Temple',
  parting_line: 'Parting',
  sides: 'Sides',
};

interface Props {
  src: string;
  zoneAnalysis: ZoneAnalysis | null;
  hairZoneAnalysis?: HairZoneAnalysis | null;
  showOverlay?: boolean;
  className?: string;
  landmarks?: Array<{ x: number; y: number; z: number }> | null;
  blazeBox?: { topLeft: [number, number]; bottomRight: [number, number] } | null;
}

export default function ClinicalHeatmap({ src, zoneAnalysis, hairZoneAnalysis, className = '' }: Props) {
  const isHair = !!hairZoneAnalysis && !zoneAnalysis;

  return (
    <div className={`heatmap-container ${className}`} style={{ width: '100%' }}>
      <img
        src={src}
        alt="Check-in photo"
        style={{ width: '100%', display: 'block', borderRadius: 10, objectFit: 'cover' }}
      />

      {/* Face zone badges */}
      {zoneAnalysis && !isHair && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 8 }}>
          {(Object.entries(zoneAnalysis) as [string, ZoneAnalysis[keyof ZoneAnalysis]][]).map(([key, data]) => {
            if (!data) return null;
            const max = Math.max(data.redness, data.swelling, data.texture_concern);
            const color = max >= 3 ? '#ef4444' : max >= 2 ? '#f59e0b' : max >= 1 ? '#fbbf24' : '#10b981';
            const bg = max >= 3 ? 'rgba(239,68,68,0.1)' : max >= 2 ? 'rgba(245,158,11,0.1)' : max >= 1 ? 'rgba(251,191,36,0.1)' : 'rgba(16,185,129,0.1)';
            return (
              <div key={key} style={{ background: bg, borderRadius: 6, padding: '4px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 1 }}>{FACE_ZONE_LABELS[key] ?? key}</div>
                <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                  <div style={{ height: '100%', width: `${(max / 3) * 100}%`, background: color, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hair zone badges */}
      {hairZoneAnalysis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 8 }}>
          {(Object.entries(hairZoneAnalysis) as [string, HairZoneAnalysis[keyof HairZoneAnalysis]][]).map(([key, data]) => {
            if (!data) return null;
            const density = data.density;
            const color = density >= 3 ? '#10b981' : density >= 2 ? '#f59e0b' : density >= 1 ? '#f97316' : '#ef4444';
            const bg = density >= 3 ? 'rgba(16,185,129,0.1)' : density >= 2 ? 'rgba(245,158,11,0.1)' : density >= 1 ? 'rgba(249,115,22,0.1)' : 'rgba(239,68,68,0.1)';
            return (
              <div key={key} style={{ background: bg, borderRadius: 6, padding: '4px 6px', textAlign: 'center', border: data.hotspot ? '1px solid rgba(239,68,68,0.4)' : 'none' }}>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 1 }}>{HAIR_ZONE_LABELS[key] ?? key}{data.hotspot ? ' ⚠' : ''}</div>
                <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                  <div style={{ height: '100%', width: `${(density / 3) * 100}%`, background: color, borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 8, color, marginTop: 1 }}>D{density}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
