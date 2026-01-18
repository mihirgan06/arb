"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface SignalMarkerProps {
  x: number;
  y: number;
  label: string;
  profit: number;
  onClick: () => void;
  active: boolean;
}

function SignalMarker({ x, y, label, profit, onClick, active }: SignalMarkerProps) {
  return (
    <motion.div
      className="absolute cursor-pointer group"
      style={{ left: `${x}%`, top: `${y}%` }}
      initial={{ scale: 0 }}
      animate={{ scale: active ? 1.3 : 1 }}
      whileHover={{ scale: 1.2 }}
      onClick={onClick}
    >
      <div className={`
        relative w-3 h-3 rounded-full transition-all duration-500
        ${active 
          ? 'bg-[#00FF80] shadow-[0_0_20px_rgba(0,255,128,0.8)] scale-150' 
          : 'bg-white/40 hover:bg-white/60 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
        }
      `}>
        {active && (
          <motion.div
            className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 bg-[#00FF80]/20 backdrop-blur-sm border border-[#00FF80]/40 rounded text-[10px] font-bold text-[#00FF80]"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
          >
            ${profit.toFixed(2)}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export default function USAMap3D({ opportunities, onSelect, selectedId }: { 
  opportunities: any[], 
  onSelect: (opp: any) => void,
  selectedId?: string 
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Map opportunities to positions (simplified US-like distribution)
  const markers = opportunities.map((opp, i) => {
    const seed = opp.id || i.toString();
    const hash = seed.split('').reduce((a: any, b: any) => { 
      a = ((a << 5) - a) + b.charCodeAt(0); 
      return a & a; 
    }, 0);
    
    // Distribute across a US-like shape
    const x = 20 + ((Math.abs(hash) % 60));
    const y = 15 + ((Math.abs(hash >> 8) % 70));
    
    return {
      id: opp.id,
      data: opp,
      x,
      y,
      profit: opp.profitCurve?.[0]?.profit || 0
    };
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: ((e.clientX - rect.left) / rect.width - 0.5) * 20,
        y: ((e.clientY - rect.top) / rect.height - 0.5) * 20
      });
    }
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative overflow-hidden cursor-grab active:cursor-grabbing"
      onMouseMove={handleMouseMove}
      style={{
        background: `
          radial-gradient(circle at ${50 + mousePos.x}% ${50 + mousePos.y}%, rgba(0,255,128,0.05) 0%, transparent 50%),
          linear-gradient(135deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.95) 100%)
        `
      }}
    >
      {/* Grid overlay for "map" feel */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          transform: `translate(${mousePos.x * 0.5}px, ${mousePos.y * 0.5}px)`
        }}
      />
      
      {/* Particle-like dots for "USA shape" */}
      <div className="absolute inset-0">
        {Array.from({ length: 300 }).map((_, i) => {
          const x = (i * 7.3) % 100;
          const y = (i * 11.7) % 100;
          // Rough USA bounding box
          if ((x > 15 && x < 85 && y > 20 && y < 80) || 
              (x > 20 && x < 30 && y > 60 && y < 90) || // Florida
              (x > 70 && x < 85 && y > 30 && y < 50)) { // West Coast
            return (
              <div
                key={i}
                className="absolute w-0.5 h-0.5 bg-white/20 rounded-full"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: `translate(${mousePos.x * 0.1}px, ${mousePos.y * 0.1}px)`
                }}
              />
            );
          }
          return null;
        })}
      </div>

      {/* Signal Markers */}
      {markers.map((m) => (
        <SignalMarker
          key={m.id}
          x={m.x}
          y={m.y}
          label={m.data.market1Question}
          profit={m.profit}
          onClick={() => onSelect(m.data)}
          active={selectedId === m.id}
        />
      ))}

      {/* Center indicator */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="w-32 h-32 border border-white/5 rounded-full flex items-center justify-center">
          <div className="text-white/10 text-[8px] uppercase tracking-[0.3em] font-bold">US Grid</div>
        </div>
      </div>
    </div>
  );
}
