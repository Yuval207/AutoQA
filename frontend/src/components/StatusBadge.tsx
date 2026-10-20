import React from 'react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  let bg = 'bg-slate-800 text-slate-300 border-slate-700';
  let dot = 'bg-slate-400';
  let pulse = false;

  switch (status?.toUpperCase()) {
    case 'PASSED':
    case 'READY':
    case 'APPROVED':
    case 'UP':
      bg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      dot = 'bg-emerald-400';
      break;

    case 'FAILED':
    case 'REJECTED':
    case 'ERROR':
    case 'PARSE_FAILED':
      bg = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      dot = 'bg-rose-400';
      break;

    case 'RUNNING':
    case 'RUNNING_TESTS':
    case 'STARTING_ENVIRONMENT':
    case 'PREPARING':
      bg = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      dot = 'bg-amber-400';
      pulse = true;
      break;

    case 'QUEUED':
    case 'PENDING':
      bg = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      dot = 'bg-indigo-400';
      break;

    case 'CRITICAL':
      bg = 'bg-red-600/20 text-red-300 border-red-500/30';
      dot = 'bg-red-500';
      break;

    case 'HIGH':
      bg = 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      dot = 'bg-orange-400';
      break;

    case 'MEDIUM':
      bg = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      dot = 'bg-amber-400';
      break;

    case 'LOW':
      bg = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      dot = 'bg-blue-400';
      break;

    default:
      bg = 'bg-slate-800 text-slate-400 border-slate-700';
      dot = 'bg-slate-500';
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1.5',
    md: 'text-xs px-2.5 py-1 gap-2 font-medium',
    lg: 'text-sm px-3 py-1.5 gap-2 font-semibold',
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full border ${bg} ${sizeClasses}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${dot} ${pulse ? 'animate-ping' : ''}`}
      />
      <span>{status?.replace(/_/g, ' ')}</span>
    </span>
  );
};
