"use client";

import React, { useRef, useEffect } from "react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend
);

interface ProfitPoint {
  shares: number;
  totalCost: number;
  totalRevenue: number;
  profit: number;
  profitPerShare: number;
}

interface ArbitrageGraphProps {
  opportunity: {
    profitCurve?: ProfitPoint[];
    profitAt100Shares?: number;
    maxProfitableShares?: number;
    executionStrategy?: {
      buyPrice: number;
      sellPrice: number;
    };
  };
}

export function ArbitrageGraph({ opportunity }: ArbitrageGraphProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current || !opportunity.profitCurve) return;

    // Destroy existing chart
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;

    const curve = opportunity.profitCurve;
    
    chartInstance.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: curve.map(p => p.shares.toLocaleString()),
        datasets: [
          {
            label: "Profit ($)",
            data: curve.map(p => p.profit),
            borderColor: "rgb(249, 115, 22)",
            backgroundColor: "rgba(249, 115, 22, 0.1)",
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index",
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            titleColor: "#fff",
            bodyColor: "#fff",
            padding: 12,
            displayColors: false,
            callbacks: {
              title: (items) => `${items[0].label} shares`,
              label: (context) => {
                const idx = context.dataIndex;
                const point = curve[idx];
                return [
                  `Profit: $${point.profit.toFixed(2)}`,
                  `Cost: $${point.totalCost.toFixed(2)}`,
                  `Revenue: $${point.totalRevenue.toFixed(2)}`,
                  `Per Share: $${point.profitPerShare.toFixed(4)}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Number of Shares",
              color: "#666",
            },
            ticks: {
              color: "#666",
              maxTicksLimit: 8,
            },
            grid: {
              color: "rgba(255, 255, 255, 0.05)",
            },
          },
          y: {
            title: {
              display: true,
              text: "Profit ($)",
              color: "#666",
            },
            ticks: {
              color: "#666",
              callback: (value) => `$${value}`,
            },
            grid: {
              color: "rgba(255, 255, 255, 0.05)",
            },
          },
        },
      },
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [opportunity]);

  if (!opportunity.profitCurve || opportunity.profitCurve.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-zinc-500">
        No profit curve data available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">Profit by Trade Size</span>
        <span className="text-zinc-500">
          Max profitable: <span className="text-white font-mono">{opportunity.maxProfitableShares?.toLocaleString()}</span> shares
        </span>
      </div>
      <div className="h-[250px]">
        <canvas ref={chartRef} />
      </div>
    </div>
  );
}
