"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ArrowUpRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

// Pinned Dropdown Component
function MarketPin({ x, y, data, active, onSelect }: { x: number, y: number, data: any, active: boolean, onSelect: () => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div 
      className="absolute cursor-pointer group z-20"
      style={{ left: `${x}%`, top: `${y}%` }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
        setIsOpen(!isOpen);
      }}
    >
      {/* The Dot */}
      <motion.div
        className={cn(
          "w-3 h-3 rounded-full transition-all duration-500 flex items-center justify-center",
          active 
            ? "bg-[#00FF80] shadow-[0_0_20px_rgba(0,255,128,0.8)] scale-150" 
            : "bg-white/40 hover:bg-white/80 hover:scale-110 shadow-[0_0_10px_rgba(255,255,255,0.2)]"
        )}
        animate={{ scale: active ? 1.5 : 1 }}
        whileHover={{ scale: active ? 1.6 : 1.2 }}
      >
        {active && <div className="w-1.5 h-1.5 bg-black rounded-full" />}
      </motion.div>

      {/* The Dropdown (Slide out) */}
      <AnimatePresence>
        {(active || isOpen) && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 30, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            className="absolute left-0 w-[240px] glass p-4 rounded-2xl pointer-events-auto z-[200] mt-2"
          >
            <div className="flex justify-between items-start mb-2">
              <p className="text-[9px] font-bold text-[#00FF80] uppercase tracking-widest">Live Node</p>
              <div className="text-sm font-bold text-[#00FF80]">
                +${(data.profitCurve?.[0]?.profit || 0).toFixed(2)}
              </div>
            </div>
            <h4 className="text-[11px] font-bold text-white/90 leading-tight mb-3 line-clamp-2">
              {data.market1Question}
            </h4>
            <div className="flex items-center gap-2">
              <div className="px-2 py-0.5 bg-white/5 border border-white/5 rounded text-[8px] font-bold text-white/40 uppercase">
                {data.market1Platform || "Node"}
              </div>
              <ArrowUpRight size={12} className="text-white/20" />
              <div className="px-2 py-0.5 bg-white/5 border border-white/5 rounded text-[8px] font-bold text-white/40 uppercase">
                {data.market2Platform || "Node"}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Globe3D({ opportunities, onSelect, selectedId }: { 
  opportunities: any[], 
  onSelect: (opp: any) => void,
  selectedId?: string 
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: ((e.clientX - rect.left) / rect.width - 0.5) * 30,
        y: ((e.clientY - rect.top) / rect.height - 0.5) * 30
      });
    }
  };

  // Map opportunities to positions (US-like distribution)
  const pins = useMemo(() => {
    return opportunities.map((opp, i) => {
      const seed = opp.id || i.toString();
      const hash = seed.split('').reduce((a: any, b: any) => { 
        a = ((a << 5) - a) + b.charCodeAt(0); 
        return a & a; 
      }, 0);
      
      // Distribute across a US-like shape
      const x = 25 + ((Math.abs(hash) % 50));
      const y = 20 + ((Math.abs(hash >> 8) % 60));
      
      return {
        id: opp.id,
        data: opp,
        x,
        y
      };
    });
  }, [opportunities]);

  if (!mounted) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black/20">
        <div className="text-white/20 font-mono text-[10px] uppercase tracking-[0.3em]">Initializing 3D Core...</div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative overflow-hidden cursor-grab active:cursor-grabbing"
      onMouseMove={handleMouseMove}
      style={{
        background: `
          radial-gradient(circle at ${50 + mousePos.x * 0.3}% ${50 + mousePos.y * 0.3}%, rgba(0,255,128,0.08) 0%, transparent 60%),
          radial-gradient(circle at ${30 + mousePos.x * 0.2}% ${70 + mousePos.y * 0.2}%, rgba(0,255,128,0.05) 0%, transparent 50%),
          linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.98) 100%)
        `
      }}
    >
      {/* Animated Grid Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,255,128,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,128,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          transform: `translate(${mousePos.x * 0.3}px, ${mousePos.y * 0.3}px)`,
          transition: 'transform 0.1s ease-out'
        }}
      />
      
      {/* Particle-like dots for "globe" effect */}
      <div className="absolute inset-0">
        {Array.from({ length: 500 }).map((_, i) => {
          const angle = (i / 500) * Math.PI * 2;
          const radius = 35 + (i % 3) * 5;
          const x = 50 + Math.cos(angle) * radius;
          const y = 50 + Math.sin(angle) * radius;
          
          return (
            <motion.div
              key={i}
              className="absolute w-0.5 h-0.5 bg-[#00FF80]/20 rounded-full"
              style={{
                left: `${x}%`,
                top: `${y}%`,
              }}
              animate={{
                opacity: [0.1, 0.3, 0.1],
                scale: [1, 1.5, 1]
              }}
              transition={{
                duration: 2 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 2
              }}
            />
          );
        })}
      </div>

      {/* US Region Highlight */}
      <motion.div
        className="absolute top-[20%] left-[25%] w-[50%] h-[60%] border-2 border-[#00FF80]/20 rounded-3xl"
        style={{
          background: 'radial-gradient(circle at center, rgba(0,255,128,0.05) 0%, transparent 70%)',
        }}
        animate={{
          opacity: [0.3, 0.5, 0.3],
          borderColor: ['rgba(0,255,128,0.2)', 'rgba(0,255,128,0.4)', 'rgba(0,255,128,0.2)']
        }}
        transition={{
          duration: 3,
          repeat: Infinity
        }}
      />

      {/* Signal Markers */}
      {pins.map((pin, index) => (
        <MarketPin
          key={pin.id || `pin-${index}`}
          x={pin.x}
          y={pin.y}
          data={pin.data}
          active={selectedId === pin.id}
          onSelect={() => onSelect(pin.data)}
        />
      ))}

      {/* Center indicator */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="w-40 h-40 border border-[#00FF80]/10 rounded-full flex items-center justify-center">
          <div className="text-[#00FF80]/10 text-[8px] uppercase tracking-[0.3em] font-bold">US Grid</div>
        </div>
      </div>
    </div>
  );
}
