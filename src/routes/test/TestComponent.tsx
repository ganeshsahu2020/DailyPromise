// src/routes/test/TestComponent.tsx
export default function TestComponent() {
  return <div>Test Component Loaded Successfully</div>;
}

// In your router, test this:
{
  path: "/test",
  lazy: () => import("./routes/test/TestComponent"),
}