// vite.config.ts
import {defineConfig,loadEnv} from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),"");
  const devPort=Number(env.VITE_DEV_PORT)||5151;

  return{
    plugins:[react()],
    resolve:{
      alias:{"@":path.resolve(__dirname,"src")},
      extensions:[".tsx",".ts",".jsx",".js",".json"]
    },
    server:{
      host:"127.0.0.1",
      port:devPort,
      fs:{strict:false,allow:[".."]},
      middlewareMode:false,
      hmr:{overlay:true}
    },
    preview:{
      host:"127.0.0.1",
      port:devPort
    },
    assetsInclude:["**/*.mp3","**/*.wav","**/*.ogg","**/*.webm"],
    build:{
      rollupOptions:{
        input:{main:"./index.html"},
        preserveEntrySignatures:"strict"
      },
      sourcemap:true
    },
    optimizeDeps:{include:["react","react-dom","react-router-dom"]},
    clearScreen:false
  };
});
