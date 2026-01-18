"use client";

import { useState, useEffect } from "react";

export function Hero3D() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="fixed inset-0 -z-10 bg-[#000000]" />;
  }

  // Generate particles only on client side to avoid hydration mismatch
  const particles = Array.from({ length: 50 }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    duration: 5 + Math.random() * 10,
    delay: Math.random() * 5,
  }));

  return (
    <div className="fixed inset-0 -z-10 bg-[#000000] overflow-hidden">
      {/* Animated gradient mesh background */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#00FF80] rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#00FF80] rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#00FF80] rounded-full blur-[150px] opacity-20 animate-pulse" style={{ animationDelay: '2s' }} />
      </div>
      
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 255, 128, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 128, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }}
      />
      
      {/* Animated particles using CSS */}
      <div className="absolute inset-0">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute w-1 h-1 bg-[#00FF80] rounded-full opacity-40"
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              animation: `float ${particle.duration}s infinite ease-in-out`,
              animationDelay: `${particle.delay}s`,
            }}
          />
        ))}
      </div>
      
      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.4;
          }
          25% {
            transform: translate(20px, -20px) scale(1.2);
            opacity: 0.6;
          }
          50% {
            transform: translate(-20px, 20px) scale(0.8);
            opacity: 0.3;
          }
          75% {
            transform: translate(10px, -10px) scale(1.1);
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}
