import React from 'react';
import { Card } from './card';

interface Props {
  label: string;
  value: number;
  subValue?: string;
}

export const StatCard = ({ label, value, subValue }: Props) => (
  <Card className="p-3 bg-muted/30 border-none shadow-none">
    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{label}</p>
    <div className="flex items-baseline gap-1 mt-1">
      <span className="text-xl font-mono font-bold tracking-tight">{value.toLocaleString()}</span>
      {subValue && <span className="text-[10px] text-muted-foreground">{subValue}</span>}
    </div>
  </Card>
);
