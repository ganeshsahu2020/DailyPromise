// src/routes/child/ChildPortal.tsx - NEW FILE
import { Outlet } from "react-router-dom";

// Simple, clean layout for child portal only - NO HEADER
export default function ChildPortal() {
  return (
    <div className="min-h-dvh bg-[var(--brand-deep)] text-[var(--brand-text)]">
      <Outlet />
    </div>
  );
}