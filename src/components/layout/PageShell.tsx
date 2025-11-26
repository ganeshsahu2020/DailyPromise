// src/components/layout/PageShell.tsx
import {ReactNode}from "react";

export const PageShell=({children}:{children:ReactNode})=>{
  return(
    <div className="min-h-screen bg-[#050816]">
      <div className="relative px-3 sm:px-6 py-6 sm:py-10 max-w-7xl mx-auto min-w-0">
        {children}
      </div>
    </div>
  );
};
