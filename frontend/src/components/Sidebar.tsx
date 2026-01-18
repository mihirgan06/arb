"use client";

import React, { useState } from "react";
import { Zap, LayoutDashboard, Settings, Menu, X, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const links = [
  { label: "Scanner", href: "/", icon: Zap },
  { label: "Portfolio", href: "#", icon: LayoutDashboard },
  { label: "Settings", href: "#", icon: Settings },
];

export function Sidebar({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(0);

  return (
    <div className="flex h-screen w-full bg-[#050505] text-white">
      {/* Desktop Sidebar */}
      <motion.div 
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="hidden md:flex h-full w-[80px] lg:w-[240px] flex-col justify-between border-r border-white/5 bg-black/40 backdrop-blur-xl p-4"
      >
        <div>
          <div className="flex items-center gap-3 px-2 py-6 mb-6">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
              <ArrowRightLeft className="h-5 w-5 text-white" />
              <div className="absolute inset-0 rounded-xl bg-white/20 mix-blend-overlay" />
            </div>
            <span className="text-xl font-bold tracking-tight hidden lg:block bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
              Arbiter
            </span>
          </div>

          <div className="space-y-2">
            {links.map((link, idx) => (
              <div
                key={idx}
                onClick={() => setActive(idx)}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all cursor-pointer overflow-hidden",
                  active === idx 
                    ? "text-white" 
                    : "text-neutral-500 hover:text-neutral-300"
                )}
              >
                {active === idx && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 bg-white/[0.08] border border-white/[0.05] rounded-xl"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                
                <div className="relative z-10 flex items-center justify-center">
                  <link.icon className={cn("h-5 w-5 transition-colors", active === idx ? "text-indigo-400" : "group-hover:text-white")} />
                </div>
                <span className="relative z-10 hidden lg:block">{link.label}</span>
                
                {active === idx && (
                  <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] hidden lg:block" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="px-2">
          <div className="rounded-2xl bg-gradient-to-br from-white/[0.05] to-transparent border border-white/[0.05] p-4 hidden lg:block">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400">
                GS
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-white">G. Suriya</span>
                <span className="text-[10px] text-neutral-500">Pro Plan</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Content Area */}
      <div className="flex-1 h-full overflow-hidden relative">
        {children}
      </div>
    </div>
  );
}
