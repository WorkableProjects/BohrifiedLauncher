import { memo } from 'react';
import { iconPaths } from '../render/icons';

export const Icon = memo(function Icon({ name, size = 18, sw = 1.75, className }: { name: string; size?: number; sw?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths(name).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
});
