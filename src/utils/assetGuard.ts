// src/utils/assetGuard.ts
export function verifyAsset(src:string, label?:string){
  const img = new Image();
  img.onload = ()=>{};
  img.onerror = ()=>{
    // eslint-disable-next-line no-console
    console.warn('[asset-missing]', label ?? src, '→ 404 or blocked');
  };
  img.src = src;
}
