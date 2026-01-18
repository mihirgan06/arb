"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarketPinProps {
  x: number;
  y: number;
  data: any;
  active: boolean;
  onSelect: () => void;
  sweepAngle: number;
}

function RadarPin({ x, y, data, active, onSelect, sweepAngle }: MarketPinProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDetected, setIsDetected] = useState(false);
  
  // Calculate angle of this pin relative to center (50, 50)
  const pinAngle = useMemo(() => {
    const dx = x - 50;
    const dy = y - 50;
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (angle < 0) angle += 360;
    return angle;
  }, [x, y]);

  // Detect when sweep line passes over
  useEffect(() => {
    const diff = Math.abs(sweepAngle - pinAngle);
    if (diff < 10 || diff > 350) {
      if (!isDetected) {
        setIsDetected(true);
        setTimeout(() => setIsDetected(false), 1000);
      }
    }
  }, [sweepAngle, pinAngle, isDetected]);

  return (
    <div 
      className="absolute cursor-pointer group z-20"
      style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
        setIsOpen(!isOpen);
      }}
    >
      {/* The Radar Ping Effect */}
      <AnimatePresence>
        {isDetected && (
          <motion.div
            initial={{ scale: 0.5, opacity: 1 }}
            animate={{ scale: 4, opacity: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "absolute inset-0 rounded-full pointer-events-none",
              active ? "bg-red-500" : "bg-[#00FF80]"
            )}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* The Dropdown */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ 
            opacity: active ? 1 : isDetected ? 0.9 : 0.7, 
            y: 20, 
            scale: active ? 1 : 0.9,
            zIndex: active ? 200 : 100
          }}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 w-[220px] glass p-4 rounded-xl pointer-events-auto shadow-[0_0_30px_rgba(0,0,0,0.8)] border-2 transition-all duration-500",
            active 
              ? "border-red-500 bg-red-500/20" 
              : isDetected 
                ? "border-[#00FF80]/60 bg-black/80" 
                : "border-[#00FF80]/20 bg-black/90"
          )}
        >
          <div className="flex justify-between items-start mb-2">
            <span className={cn(
              "text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border",
              active 
                ? "bg-red-500/20 text-red-400 border-red-500/30" 
                : "bg-[#00FF80]/10 text-[#00FF80] border-[#00FF80]/20"
            )}>{active ? "Targeted" : isDetected ? "Detected" : "Idle"}</span>
            <div className={cn("text-xs font-bold font-mono", active ? "text-red-400" : "text-[#00FF80]")}>
              +${(data.profitCurve?.[0]?.profit || 0).toFixed(2)}
            </div>
          </div>
          <h4 className="text-[10px] font-bold text-white leading-tight mb-2 line-clamp-2 uppercase tracking-tight">
            {data.market1Question}
          </h4>
          <div className="flex items-center gap-2">
            <div className="text-[7px] font-bold text-white/60 uppercase">{data.market1Platform}</div>
            <ArrowUpRight size={10} className={cn(active ? "text-red-400" : "text-[#00FF80]")} />
            <div className="text-[7px] font-bold text-white/60 uppercase">{data.market2Platform}</div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function RadarGrid({ opportunities, onSelect, selectedId }: { 
  opportunities: any[], 
  onSelect: (opp: any) => void,
  selectedId?: string 
}) {
  const [sweepAngle, setSweepAngle] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [panPos, setPanPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const lastSelectedId = useRef<string | undefined>(undefined);

  // Map opportunities to radar coordinates (Polar to Cartesian)
  const pins = useMemo(() => {
    return opportunities.map((opp, i) => {
      // Use both hash and index to ensure wide distribution
      const seed = opp.id || i.toString();
      const hash = seed.split('').reduce((a: any, b: any) => { 
        a = ((a << 5) - a) + b.charCodeAt(0); 
        return a & a; 
      }, 0);
      
      // Better spread: all opportunities inside the circular radar
      const angle = (Math.abs(hash) + (i * 137.5)) % 360; 
      const distance = 5 + ((Math.abs(hash >> 4) + (i * 12)) % 40); // Max 45% radius to stay inside
      
      const x = 50 + distance * Math.cos((angle * Math.PI) / 180);
      const y = 50 + distance * Math.sin((angle * Math.PI) / 180);
      
      return { id: opp.id, data: opp, x, y };
    });
  }, [opportunities]);

  // Center on selected opportunity
  useEffect(() => {
    if (selectedId) {
      const selectedPin = pins.find(p => p.id === selectedId);
      if (selectedPin) {
        // Automatically zoom in when selecting
        const targetZoom = 1.8;
        setZoom(targetZoom);
        
        const dx = (selectedPin.x - 50) * 18; // (x - 50)% of 1800px
        const dy = (selectedPin.y - 50) * 18; // (y - 50)% of 1800px
        
        // Center the pin
        setPanPos({ x: -dx * targetZoom, y: -dy * targetZoom });
      }
    } else if (lastSelectedId.current) {
      // Reset position and zoom when deselecting
      setPanPos({ x: 0, y: 0 });
      setZoom(1.0); // Reset to sensory baseline
    }
    lastSelectedId.current = selectedId;
  }, [selectedId, pins]); // Removed zoom dependency to prevent feedback loops when centering

  // Rotate sweep line
  useEffect(() => {
    let frame: number;
    const animate = () => {
      setSweepAngle((prev) => (prev + 1.2) % 360);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    setZoom(prev => Math.min(Math.max(prev - e.deltaY * 0.001, 0.3), 3));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setPanPos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div 
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={cn(
        "w-full h-full relative flex items-center justify-center overflow-hidden bg-[#010101]",
        isDragging ? "cursor-grabbing" : "cursor-grab"
      )}
    >
      {/* Dynamic Background Atmosphere */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1800px] h-[1800px] rounded-full"
          style={{ 
            background: 'radial-gradient(circle at center, rgba(0,255,128,0.05) 0%, transparent 70%)',
            transform: `translate(calc(-50% + ${panPos.x * 0.2}px), calc(-50% + ${panPos.y * 0.2}px))`
          }}
        />
      </div>

      {/* Radar Main Assembly */}
      <motion.div 
        animate={{ 
          scale: zoom,
          x: panPos.x,
          y: panPos.y
        }}
        transition={{ 
          type: "spring", 
          damping: 30, 
          stiffness: 150,
          scale: { duration: 0.2 } // Fast zoom
        }}
        className="relative rounded-full border border-[#00FF80]/15 flex items-center justify-center shadow-[inset_0_0_150px_rgba(0,255,128,0.03)] overflow-hidden bg-[#010101]"
        style={{ width: '1800px', height: '1800px', flexShrink: 0 }}
      >
        {/* Tactical Grid Lines */}
        <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
          {/* Concentric Circles */}
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((radius) => (
            <div 
              key={radius}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border border-[#00FF80]/10 rounded-full"
              style={{ width: `${radius}%`, height: `${radius}%` }}
            />
          ))}
          
          {/* Axis Lines (Clock markings) */}
          {Array.from({ length: 12 }).map((_, i) => (
            <div 
              key={i}
              className="absolute top-1/2 left-1/2 w-full h-px bg-[#00FF80]/15"
              style={{ transform: `translate(-50%, -50%) rotate(${i * 30}deg)` }}
            />
          ))}
          
          {/* Global Cross Grid */}
          <div 
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(0,255,128,0.5) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0,255,128,0.5) 1px, transparent 1px)
              `,
              backgroundSize: '50px 50px',
            }}
          />
        </div>

      {/* The Active Sweep Array */}
      <div 
        className="absolute top-1/2 left-1/2 w-full h-full -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
        style={{ transform: `translate(-50%, -50%) rotate(${sweepAngle}deg)` }}
      >
        {/* Primary Sweep line */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[3px] h-1/2 bg-gradient-to-t from-transparent via-[#00FF80]/50 to-[#00FF80] shadow-[0_0_30px_#00FF80]" />
        
        {/* Trailing Radar Shadow */}
        <div 
          className="absolute top-0 left-1/2 -translate-x-full w-[400px] h-1/2"
          style={{ 
            background: 'conic-gradient(from 180deg at 100% 100%, transparent 0deg, rgba(0,255,128,0.15) 20deg, transparent 60deg)',
            transform: 'translateX(0)'
          }}
        />
      </div>

        {/* Target Nodes */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="relative w-full h-full pointer-events-auto">
            {pins.map((pin, index) => (
          <RadarPin
            key={pin.id || `pin-${index}`}
            x={pin.x}
            y={pin.y}
            data={pin.data}
            active={!!selectedId && !!pin.id && selectedId === pin.id}
            onSelect={() => onSelect(pin.data)}
            sweepAngle={sweepAngle}
          />
            ))}
          </div>
        </div>

        {/* Core Array Hub */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
          <div className="w-24 h-24 border-2 border-[#00FF80]/20 rounded-full flex items-center justify-center bg-black/60 backdrop-blur-xl ring-8 ring-[#00FF80]/5">
            <div className="w-1.5 h-1.5 bg-[#00FF80] rounded-full animate-ping" />
            <div className="absolute inset-0 border border-[#00FF80]/10 rounded-full animate-pulse" />
          </div>
        </div>
      </motion.div>

      {/* TACTICAL HUD OVERLAYS */}
      
      {/* System Status (Top Left) */}
      <div className="absolute top-10 left-10 z-40 pointer-events-none font-mono">
        <div className="flex flex-col gap-2 glass p-4 rounded-xl border-[#00FF80]/20">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-[#00FF80] rounded-full animate-pulse shadow-[0_0_10px_#00FF80]" />
            <span className="text-[11px] font-bold text-[#00FF80] uppercase tracking-[0.4em]">Tracking_Active</span>
          </div>
          <div className="h-px w-full bg-white/5" />
          <div className="flex flex-col gap-1 opacity-40">
            <span className="text-[8px] uppercase tracking-widest text-white/60">Scan Range: 1200LY</span>
            <span className="text-[8px] uppercase tracking-widest text-white/60">Coordinates: {panPos.x.toFixed(0)}:{panPos.y.toFixed(0)}</span>
          </div>
        </div>
      </div>

          {/* Navigation Tools (Bottom Right) */}
          <div className="absolute bottom-10 right-10 z-40 flex flex-col items-end gap-4 pointer-events-none">
            <div className="glass p-4 rounded-2xl flex flex-col gap-4 border-[#00FF80]/10 pointer-events-auto w-64">
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest font-mono">Sensory_Zoom</span>
                  <span className="text-[10px] font-bold text-[#00FF80] font-mono w-12 text-right">{(zoom * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0.1" 
                  max="3" 
                  step="0.01" 
                  value={zoom} 
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-[#00FF80] hover:accent-[#00FF80]/80 transition-all"
                />
              </div>
              <div className="h-px w-full bg-white/5" />
              <p className="text-[8px] text-white/20 uppercase font-mono tracking-tighter text-center">
                Click + Drag to Pan Tactical View
              </p>
            </div>
          </div>
        </div>
      );
    }
