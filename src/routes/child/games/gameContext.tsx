import {createContext,useContext,PropsWithChildren}from "react";

export type GameContextType={
  childId:string|null;
  childName:string|null;
};

const defaultValue:GameContextType={childId:null,childName:null};

export const GameContext=createContext<GameContextType>(defaultValue);

export function GameProvider({value,children}:PropsWithChildren<{value:GameContextType}>){
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGameContext(){
  const ctx=useContext(GameContext);
  if(ctx===defaultValue){
    throw new Error("useGameContext must be used within a <GameProvider>");
  }
  return ctx;
}
