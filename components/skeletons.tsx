import React from "react";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200 ${className}`}
    />
  );
}

export function CategorySkeleton() {
  return (
    <div className="flex gap-2 overflow-x-hidden py-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-8 w-20 rounded-full shrink-0" />
      ))}
    </div>
  );
}

export function MenuItemSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-8 w-16 rounded-xl" />
      </div>
    </div>
  );
}

export function MenuGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
        <MenuItemSkeleton key={i} />
      ))}
    </div>
  );
}

export function TableGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((i) => (
        <div key={i} className="aspect-square rounded-2xl border border-slate-100 bg-slate-50 p-2">
           <Skeleton className="h-full w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-10 flex-1 rounded-xl" />
        <Skeleton className="h-10 w-24 rounded-xl" />
      </div>
    </div>
  );
}

export function OrderGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map(i => <OrderCardSkeleton key={i} />)}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f8f6ef]">
      {/* Sidebar Skeleton */}
      <div className="hidden w-72 flex-col border-r border-[#e6dfd1] bg-white p-6 lg:flex">
         <div className="mb-10 flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-6 w-32" />
         </div>
         <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ))}
         </div>
         <div className="mt-auto">
            <Skeleton className="h-16 w-full rounded-2xl" />
         </div>
      </div>
      
      {/* Main Content Skeleton */}
      <div className="flex flex-1 flex-col overflow-y-auto p-4 sm:p-6 lg:p-8">
         {/* Header */}
         <div className="mb-8 flex items-center justify-between">
            <div className="space-y-2">
               <Skeleton className="h-8 w-48" />
               <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex gap-3">
               <Skeleton className="h-10 w-10 rounded-xl" />
               <Skeleton className="h-10 w-10 rounded-xl" />
            </div>
         </div>
         
         {/* KPI Grid */}
         <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-28 w-full rounded-3xl border border-[#e6dfd1] bg-white" />
            ))}
         </div>
         
         {/* Large Card Content */}
         <div className="flex-1 rounded-3xl border border-[#e6dfd1] bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
               <Skeleton className="h-6 w-40" />
               <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
            <div className="space-y-4">
               {[1, 2, 3, 4, 5].map(i => (
                 <Skeleton key={i} className="h-16 w-full rounded-2xl" />
               ))}
            </div>
         </div>
      </div>
    </div>
  );
}
