// src/auth/AuthContext.tsx
import {createContext,useContext,useEffect,useState,type ReactNode}from "react";
import {supabase}from "@/lib/supabase";

type RoleType="parent"|"child"|null;

type AuthUserContextValue={
  user:any;
  role:RoleType;
  loading:boolean;
};

const AuthUserContext=createContext<AuthUserContextValue|undefined>(undefined);

function deriveRole(user:any):RoleType{
  if(!user)return null;
  const meta=user.user_metadata||user.app_metadata||{};
  const rawRole=meta.role||meta.user_role;
  if(rawRole==="parent"||rawRole==="child")return rawRole;
  return null;
}

export function AuthProvider({children}:{children:ReactNode}){
  const [user,setUser]=useState<any>(null);
  const [role,setRole]=useState<RoleType>(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    let active=true;

    const init=async()=>{
      try{
        // ✅ Only getSession – no getUser here at all
        const {data,error}=await supabase.auth.getSession();
        if(error){
          console.error("[AuthProvider.getSession]",error);
        }

        if(!active)return;

        const session=data?.session||null;

        if(!session){
          setUser(null);
          setRole(null);
          setLoading(false);
          return;
        }

        const u=session.user||null;
        setUser(u);
        setRole(deriveRole(u));
        setLoading(false);
      }catch(err){
        console.error("[AuthProvider.init]",err);
        if(active){
          setUser(null);
          setRole(null);
          setLoading(false);
        }
      }
    };

    init();

    const {data:sub}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(!active)return;
      const u=session?.user||null;
      setUser(u);
      setRole(deriveRole(u));
    });

    return()=>{
      active=false;
      sub.subscription.unsubscribe();
    };
  },[]);

  return(
    <AuthUserContext.Provider value={{user,role,loading}}>
      {children}
    </AuthUserContext.Provider>
  );
}

export function useAuthUser():AuthUserContextValue{
  const ctx=useContext(AuthUserContext);
  if(!ctx){
    console.warn("[useAuthUser] used outside AuthProvider, returning default logged-out state");
    return {user:null,role:null,loading:true};
  }
  return ctx;
}

export function useAuth(){
  return useAuthUser();
}
