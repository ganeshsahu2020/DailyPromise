import { createContext, useContext, useMemo, useState } from "react";

type Dict = Record<string, string>;
const DICTS: Record<string, Dict> = {
  en: {
    sign_in: "Sign in",
    sign_out: "Sign out",
    register: "Register",
    parent_dashboard: "Parent Dashboard",
    children: "Children",
    my_profile: "My Profile",
    targets: "Targets",
    rewards: "Rewards",
    approvals: "Approvals",
  },
  hi: {
    sign_in: "लॉग इन",
    sign_out: "लॉग आउट",
    register: "रजिस्टर",
    parent_dashboard: "अभिभावक डैशबोर्ड",
    children: "बच्चे",
    my_profile: "मेरा प्रोफ़ाइल",
    targets: "लक्ष्य",
    rewards: "इनाम",
    approvals: "स्वीकृतियाँ",
  },
};

const I18nCtx = createContext<{ t:(k:string)=>string; lang:string; setLang:(l:string)=>void; }>({
  t: k => k,
  lang: "en",
  setLang: () => {},
});

export function I18nProvider({ children, initial="en" }:{children: any; initial?: string}) {
  const [lang, setLang] = useState(initial);
  const t = useMemo(() => (key: string) => DICTS[lang]?.[key] ?? DICTS.en[key] ?? key, [lang]);
  return <I18nCtx.Provider value={{ t, lang, setLang }}>{children}</I18nCtx.Provider>;
}

export const useT = () => useContext(I18nCtx);
