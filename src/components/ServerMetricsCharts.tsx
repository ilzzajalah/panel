import React, { useState } from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ReferenceLine 
} from 'recharts';
import { Cpu, HardDrive, RefreshCw, Activity, Zap, Maximize2, Minimize2 } from 'lucide-react';

export interface MetricPoint {
  time: string;
  timestamp: number;
  cpuPercent: number;
  ramMb: number;
  ramPercent: number;
  cpuLimit: number;
  ramLimitMb: number;
}

interface ServerMetricsChartsProps {
  metricsHistory: MetricPoint[];
  cpuLimit: number;
  ramLimitMb: number;
  currentCpu: number;
  currentRamMb: number;
  currentRamPercent: number;
  isRunning: boolean;
  onRefreshStats?: () => void;
  isRefreshing?: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data: MetricPoint = payload[0].payload;
    return (
      <div className="bg-neutral-900/95 border border-neutral-800 backdrop-blur-md rounded-xl p-3 shadow-2xl text-xs font-mono space-y-1.5 min-w-[180px]">
        <div className="text-neutral-400 pb-1 border-b border-neutral-800 flex items-center justify-between">
          <span>Waktu</span>
          <span className="text-white font-semibold">{label}</span>
        </div>
        <div className="flex items-center justify-between text-emerald-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            CPU Load:
          </span>
          <span className="font-bold">{data.cpuPercent}%</span>
        </div>
        <div className="flex items-center justify-between text-violet-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
            RAM Used:
          </span>
          <span className="font-bold">{data.ramMb} MB ({data.ramPercent}%)</span>
        </div>
      </div>
    );
  }
  return null;
};

export const ServerMetricsCharts: React.FC<ServerMetricsChartsProps> = ({
  metricsHistory,
  cpuLimit,
  ramLimitMb,
  currentCpu,
  currentRamMb,
  currentRamPercent,
  isRunning,
  onRefreshStats,
  isRefreshing = false
}) => {
  const [activeView, setActiveView] = useState<'both' | 'cpu' | 'ram'>('both');
  const [chartMode, setChartMode] = useState<'absolute' | 'percentage'>('absolute');

  // Calculate status badges
  const getCpuBadgeColor = (val: number) => {
    if (val > 85) return 'text-rose-400 bg-rose-950/50 border-rose-800';
    if (val > 60) return 'text-amber-400 bg-amber-950/50 border-amber-800';
    return 'text-emerald-400 bg-emerald-950/50 border-emerald-800';
  };

  const getRamBadgeColor = (pct: number) => {
    if (pct > 85) return 'text-rose-400 bg-rose-950/50 border-rose-800';
    if (pct > 60) return 'text-amber-400 bg-amber-950/50 border-amber-800';
    return 'text-violet-400 bg-violet-950/50 border-violet-800';
  };

  const dataToDisplay = metricsHistory.length > 0 
    ? metricsHistory 
    : [{ time: '12:00:00', timestamp: Date.now(), cpuPercent: currentCpu, ramMb: currentRamMb, ramPercent: currentRamPercent, cpuLimit, ramLimitMb }];

  return (
    <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-5 shadow-lg space-y-4">
      {/* Chart Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-950/60 border border-emerald-800/50 text-emerald-400">
            <Activity className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">Grafik Performa Real-Time</h3>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-[10px] font-mono text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>LIVE STATS (2s)</span>
              </div>
            </div>
            <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
              Monitoring penggunaan CPU Load & Alokasi RAM secara kontinyu
            </p>
          </div>
        </div>

        {/* View Switches & Refresh Button */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center p-0.5 bg-neutral-950 border border-neutral-800 rounded-lg text-[11px] font-mono">
            <button
              onClick={() => setActiveView('both')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeView === 'both' ? 'bg-neutral-800 text-white font-semibold' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Dual View
            </button>
            <button
              onClick={() => setActiveView('cpu')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeView === 'cpu' ? 'bg-emerald-950 text-emerald-300 font-semibold border border-emerald-800/40' : 'text-neutral-400 hover:text-white'
              }`}
            >
              CPU
            </button>
            <button
              onClick={() => setActiveView('ram')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeView === 'ram' ? 'bg-violet-950 text-violet-300 font-semibold border border-violet-800/40' : 'text-neutral-400 hover:text-white'
              }`}
            >
              RAM
            </button>
          </div>

          {onRefreshStats && (
            <button
              onClick={onRefreshStats}
              disabled={isRefreshing}
              className="p-1.5 text-xs rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors flex items-center gap-1"
              title="Manual refresh stats API"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Metric Cards Banner */}
      <div className="grid grid-cols-2 gap-3 font-mono">
        {/* CPU Summary */}
        <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-800/40 text-emerald-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-neutral-400 uppercase tracking-wider">CPU Utilization</div>
              <div className="text-base font-bold text-white tabular-nums flex items-baseline gap-1">
                <span>{currentCpu}%</span>
                <span className="text-[10px] text-neutral-500 font-normal">/ {cpuLimit}% limit</span>
              </div>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getCpuBadgeColor(currentCpu)}`}>
            {isRunning ? `${currentCpu}%` : 'OFFLINE'}
          </span>
        </div>

        {/* RAM Summary */}
        <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-violet-950/80 border border-violet-800/40 text-violet-400">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-neutral-400 uppercase tracking-wider">RAM Usage</div>
              <div className="text-base font-bold text-white tabular-nums flex items-baseline gap-1">
                <span>{currentRamMb} MB</span>
                <span className="text-[10px] text-neutral-500 font-normal">/ {ramLimitMb} MB</span>
              </div>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getRamBadgeColor(currentRamPercent)}`}>
            {isRunning ? `${currentRamPercent}%` : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CPU CHART */}
        {(activeView === 'both' || activeView === 'cpu') && (
          <div className={`p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 flex flex-col ${activeView === 'cpu' ? 'lg:col-span-2' : ''}`}>
            <div className="flex items-center justify-between mb-3 text-xs font-mono">
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                CPU Load (%)
              </span>
              <span className="text-neutral-500 text-[11px]">Batas: {cpuLimit}%</span>
            </div>

            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dataToDisplay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    stroke="#525252" 
                    tick={{ fill: '#737373', fontSize: 10, fontFamily: 'monospace' }}
                    tickLine={false}
                  />
                  <YAxis 
                    domain={[0, Math.max(100, Math.ceil(cpuLimit * 1.1))]} 
                    stroke="#525252" 
                    tick={{ fill: '#737373', fontSize: 10, fontFamily: 'monospace' }}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={cpuLimit} stroke="#ef4444" strokeDasharray="3 3" label={{ value: `Limit ${cpuLimit}%`, fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
                  <Area 
                    type="monotone" 
                    dataKey="cpuPercent" 
                    name="CPU Load"
                    stroke="#10b981" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#cpuGradient)" 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* RAM CHART */}
        {(activeView === 'both' || activeView === 'ram') && (
          <div className={`p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 flex flex-col ${activeView === 'ram' ? 'lg:col-span-2' : ''}`}>
            <div className="flex items-center justify-between mb-3 text-xs font-mono">
              <span className="text-violet-400 font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                RAM Memory Usage (MB)
              </span>
              <span className="text-neutral-500 text-[11px]">Kapasitas: {ramLimitMb} MB</span>
            </div>

            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dataToDisplay} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    stroke="#525252" 
                    tick={{ fill: '#737373', fontSize: 10, fontFamily: 'monospace' }}
                    tickLine={false}
                  />
                  <YAxis 
                    domain={[0, Math.ceil(ramLimitMb * 1.05)]} 
                    stroke="#525252" 
                    tick={{ fill: '#737373', fontSize: 10, fontFamily: 'monospace' }}
                    tickLine={false}
                    unit="MB"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={ramLimitMb} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: `Max ${ramLimitMb}MB`, fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} />
                  <Area 
                    type="monotone" 
                    dataKey="ramMb" 
                    name="RAM Used"
                    stroke="#8b5cf6" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#ramGradient)" 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
