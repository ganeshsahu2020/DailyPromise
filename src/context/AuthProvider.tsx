// src/context/AuthProvider.tsx
import {AuthProvider as InnerAuthProvider,useAuthUser}from "@/auth/AuthContext";

export const AuthProvider=InnerAuthProvider;
export {useAuthUser};

export function useAuth(){
  return useAuthUser();
}
