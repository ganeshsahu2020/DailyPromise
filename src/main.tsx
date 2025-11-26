// src/main.tsx
import {StrictMode,Suspense,lazy}from "react";
import {createRoot}from "react-dom/client";
import {createBrowserRouter,RouterProvider,Navigate}from "react-router-dom";
import {Toaster}from "sonner";

import "./index.css";
import "./styles/brand.css";
import "./styles/theme-override.css";
import "./styles/animations.css";

import App from "./routes/App";
import ParentLayout from "./routes/parent/ParentLayout";
import ChildPortal from "./routes/child/ChildPortal";

// ---- Parent routes (eager) ----
import ParentDashboard from "./routes/parent/Dashboard";
import ParentProfilePage from "./routes/parent/Profile";
import ChildrenPage from "./routes/parent/Children";
import TargetsPage from "./routes/parent/Targets";
import RewardsPage from "./routes/parent/Rewards";
import ChildPasswordsPage from "./routes/parent/ChildPasswords";
import PrintQRCards from "./routes/parent/PrintQRCards";
import ParentWishlist from "./routes/parent/ChildWishlist";
import ChildDailyActivity from "./routes/parent/ChildDailyActivity";
import ParentChecklists from "./routes/parent/Checklists";
import ParentRedemptions from "./routes/parent/Redemptions";
import ReportPreview from "./routes/parent/ReportPreview";

// 🔍 Supabase health check (new)
import TestSupabasePing from "./routes/TestSupabasePing";

// 🔍 Edge function test (new)
import TestEdge from "./routes/TestEdge";

// ---- Child shell + guard (eager) ----
import ChildLayout from "./routes/child/ChildLayout";
import ChildPortalDashboard from "./routes/child/Dashboard";
import ChildRouteGuard from "./components/ChildRouteGuard";

// 🚨 EAGER child login + kiosk (no lazy, no dynamic import)
import ChildLogin from "./routes/child/Login";
import ChildKiosk from "./routes/child/Kiosk";

// ---- Child pages (lazy) ----
const ChildProfile=lazy(()=>import("./routes/child/ChildProfile"));
const ChildRewards=lazy(()=>import("./routes/child/ChildRewards"));
const ChildWishlist=lazy(()=>import("./routes/child/ChildWishlist"));
const AiWishlist=lazy(()=>import("./routes/child/AiWishlist"));
const TargetDetail=lazy(()=>import("./routes/child/TargetDetail"));
const CompletedTargets=lazy(()=>import("./routes/child/CompletedTargets"));
const DailyActivity=lazy(()=>import("./routes/child/DailyActivity"));
const ChildChecklists=lazy(()=>import("./routes/child/Checklists"));
const ChildReports=lazy(()=>import("./routes/child/Reports"));
const ChildEarnings=lazy(()=>import("./routes/child/Earnings"));
const ChildSummaryPage=lazy(()=>import("./routes/child/Summary"));
const MagicStoryMaker=lazy(()=>import("./routes/child/MagicStoryMaker"));
const StoryLibrary=lazy(()=>import("./routes/child/StoryLibrary"));
const ChildTargetsPage=lazy(()=>import("./routes/child/Targets"));
const ChildPointsGuide=lazy(()=>import("./routes/child/ChildPointsGuide"));

// ---- Auth (eager) ----
import Login from "./routes/auth/Login";
import Register from "./routes/auth/Register";
import ResetPassword from "./routes/auth/ResetPassword";
import ConfirmEmail from "./routes/auth/ConfirmEmail";

// ---- Marketing Home ----
import MarketingHome from "./routes/marketing/Home";

// ---- Legal pages ----
import TermsPage from "./routes/Terms";
import PrivacyPage from "./routes/Privacy";

// ---- Games (lazy) ----
const PlayGame=lazy(()=>import("./routes/child/PlayGame"));
const StarCatcher=lazy(()=>import("./routes/child/games/StarCatcher"));
const MemoryMatch=lazy(()=>import("./routes/child/games/MemoryMatch"));
const WordBuilder=lazy(()=>import("./routes/child/games/WordBuilder"));
const JumpPlatformer=lazy(()=>import("./routes/child/games/JumpPlatformer"));
const MathSprint=lazy(()=>import("./routes/child/games/MathSprint"));
const AnyRunner=lazy(()=>import("./routes/child/games/AnyRunner"));

// ---- Admin (eager) ----
import AdminLogin from "./routes/admin/AdminLogin";
import AdminRegister from "./routes/admin/AdminRegister";
import AdminResetPassword from "./routes/admin/AdminResetPassword";
import AdminLayout from "./routes/admin/AdminLayout";
import AdminDashboard from "./routes/admin/AdminDashboard";
import AdminAiUsage from "./routes/admin/AdminAiUsage";
import AdminFamilies from "./routes/admin/AdminFamilies";

// ---- Providers ----
import {ThemeProvider}from "./theme";
import {I18nProvider}from "./i18n";
import {AuthProvider}from "@/context/AuthProvider"; // ✅ unified auth context

// ---- Route error boundary ----
import RouteErrorBoundary from "./components/RouteErrorBoundary";

const loader=<div className="p-4 text-white/70">Loading…</div>;

const router=createBrowserRouter([
  {
    path:"/",
    element:<App/>,
    children:[
      {index:true,element:<MarketingHome/>},
      {path:"auth/login",element:<Login/>},
      {path:"auth/register",element:<Register/>},
      {path:"auth/reset",element:<ResetPassword/>},
      {path:"auth/confirm-email",element:<ConfirmEmail/>},
      {path:"terms",element:<TermsPage/>},
      {path:"privacy",element:<PrivacyPage/>},
    ],
  },

  {
    path:"/test-supabase",
    element:<TestSupabasePing/>,
  },

  {
    path:"/test-edge",
    element:<TestEdge/>,
  },

  // ---- Admin routes ----
  {
    path:"/admin/login",
    element:<AdminLogin/>,
  },
  {
    path:"/admin/register",
    element:<AdminRegister/>,
  },
  {
    path:"/admin/reset",
    element:<AdminResetPassword/>,
  },
  {
    path:"/admin",
    element:<AdminLayout/>,
    children:[
      {index:true,element:<AdminDashboard/>},
      {path:"ai-usage",element:<AdminAiUsage/>},
      {path:"families",element:<AdminFamilies/>},
    ],
  },

  // ---- Parent routes ----
  {
    path:"/parent",
    element:<ParentLayout/>,
    children:[
      {index:true,element:<ParentDashboard/>},
      {path:"profile",element:<ParentProfilePage/>},
      {path:"children",element:<ChildrenPage/>},
      {path:"targets",element:<TargetsPage/>},
      {path:"rewards",element:<RewardsPage/>},
      {path:"approvals",element:<Navigate to="/parent/rewards" replace/>},
      {path:"child-passwords",element:<ChildPasswordsPage/>},
      {path:"qr-cards",element:<PrintQRCards/>},
      {path:"wishlist",element:<ParentWishlist/>},
      {path:"daily-activities",element:<ChildDailyActivity/>},
      {path:"daily",element:<Navigate to="/parent/daily-activities" replace/>},
      {path:"checklists",element:<ParentChecklists/>},
      {path:"redemptions",element:<ParentRedemptions/>},
      {path:"report/preview",element:<ReportPreview/>},
    ],
  },

  // ---- Child routes ----
  {
    path:"/child",
    element:<ChildPortal/>,
    children:[
      {path:"login",element:<ChildLogin/>},
      {path:"kiosk",element:<ChildKiosk/>},
      {
        path:"",
        element:(
          <ChildRouteGuard>
            <ChildLayout/>
          </ChildRouteGuard>
        ),
        children:[
          {index:true,element:<ChildPortalDashboard/>},
          {
            path:"daily-activity",
            element:(
              <Suspense fallback={loader}>
                <DailyActivity/>
              </Suspense>
            ),
          },
          {
            path:"completed",
            element:(
              <Suspense fallback={loader}>
                <CompletedTargets/>
              </Suspense>
            ),
          },
          {
            path:"profile",
            element:(
              <Suspense fallback={loader}>
                <ChildProfile/>
              </Suspense>
            ),
          },
          {
            path:"rewards",
            element:(
              <Suspense fallback={loader}>
                <ChildRewards/>
              </Suspense>
            ),
          },
          {
            path:"wishlist",
            element:(
              <Suspense fallback={loader}>
                <ChildWishlist/>
              </Suspense>
            ),
          },
          {
            path:"ai-wishlist",
            element:(
              <Suspense fallback={loader}>
                <AiWishlist/>
              </Suspense>
            ),
          },
          {
            path:"magic-story-maker",
            element:(
              <Suspense fallback={loader}>
                <MagicStoryMaker/>
              </Suspense>
            ),
          },
          {
            path:"story-library",
            element:(
              <Suspense fallback={loader}>
                <StoryLibrary/>
              </Suspense>
            ),
          },
          {
            path:"target/:id",
            element:(
              <Suspense fallback={loader}>
                <TargetDetail/>
              </Suspense>
            ),
          },
          {
            path:"targets",
            element:(
              <Suspense fallback={loader}>
                <ChildTargetsPage/>
              </Suspense>
            ),
          },
          {
            path:"checklists",
            element:(
              <RouteErrorBoundary>
                <Suspense fallback={loader}>
                  <ChildChecklists/>
                </Suspense>
              </RouteErrorBoundary>
            ),
          },
          {
            path:"reports",
            element:(
              <Suspense fallback={loader}>
                <ChildReports/>
              </Suspense>
            ),
          },
          {
            path:"earnings",
            element:(
              <Suspense fallback={loader}>
                <ChildEarnings/>
              </Suspense>
            ),
          },
          {
            path:"summary",
            element:(
              <Suspense fallback={loader}>
                <ChildSummaryPage/>
              </Suspense>
            ),
          },
          {
            path:"points-guide",
            element:(
              <Suspense fallback={loader}>
                <ChildPointsGuide/>
              </Suspense>
            ),
          },
          {
            path:"game",
            element:(
              <Suspense fallback={loader}>
                <PlayGame/>
              </Suspense>
            ),
            children:[
              {
                index:true,
                element:<div className="text-white/70 p-4">Pick a game on the left to start!</div>,
              },
              {
                path:"star",
                element:(
                  <Suspense fallback={loader}>
                    <StarCatcher/>
                  </Suspense>
                ),
              },
              {
                path:"memory",
                element:(
                  <Suspense fallback={loader}>
                    <MemoryMatch/>
                  </Suspense>
                ),
              },
              {
                path:"words",
                element:(
                  <Suspense fallback={loader}>
                    <WordBuilder/>
                  </Suspense>
                ),
              },
              {
                path:"jump",
                element:(
                  <Suspense fallback={loader}>
                    <JumpPlatformer/>
                  </Suspense>
                ),
              },
              {
                path:"math",
                element:(
                  <Suspense fallback={loader}>
                    <MathSprint/>
                  </Suspense>
                ),
              },
              {
                path:"run",
                element:(
                  <Suspense fallback={loader}>
                    <AnyRunner/>
                  </Suspense>
                ),
              },
            ],
          },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider initial="en">
        <AuthProvider>
          <>
            <svg width="0" height="0" className="absolute">
              <defs>
                <linearGradient id="iconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#667eea"/>
                  <stop offset="100%" stopColor="#764ba2"/>
                </linearGradient>
              </defs>
            </svg>

            <Toaster
              position="top-right"
              theme="dark"
              richColors
              expand
              closeButton
              duration={3500}
            />

            <RouterProvider router={router}/>
          </>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);
