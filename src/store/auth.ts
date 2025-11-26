import { create } from "zustand";
type Role = "parent" | "child" | null;

type S = {
  role: Role;
  familyId?: string;
  setRole: (r: Role) => void;
  setFamily: (f?: string) => void;
};
export const useAuthStore = create<S>((set)=>({
  role: null,
  setRole: (role)=>set({role}),
  setFamily: (familyId)=>set({familyId}),
}));
