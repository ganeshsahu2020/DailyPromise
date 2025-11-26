// src/vite-env.d.ts
/// <reference types="vite/client" />
declare module "*.txt?raw" {
  const content: string;
  export default content;
}
