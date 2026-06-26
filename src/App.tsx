import { useState, useEffect } from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { auth } from "./lib/firebase";
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import { HeartPulse } from "lucide-react";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // Listen for authentication state tokens dynamically on bundle mount
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setInitializing(false);
    });

    return () => unsubscribe();
  }, []);

  // Show a beautifully styled loading screen while initializing Firebase context
  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4" id="app-loading">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-50 border border-teal-100 text-teal-600 mb-4 shadow-sm relative">
            <HeartPulse className="w-8 h-8 text-emerald-500 animate-pulse" />
            <div className="absolute inset-0 rounded-2xl border-2 border-emerald-400 border-t-transparent animate-spin" />
          </div>
          <h2 className="text-sm font-bold text-slate-800 tracking-tight">Syncing MediScan Workspace...</h2>
          <p className="text-[10px] text-slate-400 font-mono mt-1">ESTABLISHING FIREBASE AUTHTOKEN CHANNEL</p>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error("Logout process failed:", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black text-slate-800 dark:text-slate-100 antialiased transition-colors duration-200" id="app-root">
      {user ? (
        <Dashboard user={user} onLogOut={handleSignOut} />
      ) : (
        <Auth onAuthSuccess={(usr) => setUser(usr)} />
      )}
    </div>
  );
}
