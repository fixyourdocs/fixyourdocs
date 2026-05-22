import { HTMLAttributes } from 'react';

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}
      {...rest}
    />
  );
}

export function CardHeader({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`border-b border-slate-200 px-5 py-3 ${className}`} {...rest} />;
}

export function CardBody({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-5 py-4 ${className}`} {...rest} />;
}
