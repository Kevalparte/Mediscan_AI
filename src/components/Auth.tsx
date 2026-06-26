import React, { useState } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { Shield, Sparkles, HeartPulse, Mail, Lock, User, CheckCircle, Eye, EyeOff } from "lucide-react";

interface AuthProps {
  onAuthSuccess: (user: any) => void;
}

export default function Auth({ onAuthSuccess }: AuthProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);

  const clearAuthCache = () => {
    setPassword("");
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      // Save user details to Firestore 'users' collection
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split("@")[0] || "Anonymous",
        createdAt: new Date().toISOString(),
      }, { merge: true });

      setSuccessMsg("Logged in with Google successfully!");
      setTimeout(() => {
        onAuthSuccess(user);
      }, 1000);
    } catch (err: any) {
      console.error("Google login error:", err);
      // Nice message for cancel or blocked popup
      if (err.code === "auth/popup-blocked") {
        setError("Sign-in popup was blocked by your browser. Please allow popups.");
      } else if (err.code === "auth/popup-closed-by-user") {
        setError("Sign-in popup was closed before completing.");
      } else {
        setError(err.message || "Failed to sign in with Google.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {

    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (isRegister) {
        // Create user with Email
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Custom update display name without failing entire registration
        try {
          await updateProfile(user, { displayName: displayName || email.split("@")[0] });
        } catch (profileErr) {
          console.error("Non-blocking profile update error:", profileErr);
        }

        // Save profile metadata in Firestore under 'users' collection without failing registration
        try {
          await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: user.email,
            displayName: displayName || email.split("@")[0],
            createdAt: new Date().toISOString(),
          });
        } catch (dbErr) {
          console.error("Non-blocking user document insert error:", dbErr);
        }

        setSuccessMsg("Account registered successfully! Redirecting...");
        setTimeout(() => {
          onAuthSuccess(user);
        }, 1500);
      } else {
        // Sign In via Firebase Authentication
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        onAuthSuccess(userCredential.user);
      }
    } catch (err: any) {
      console.error("Auth process error:", err);
      // Give pretty messages for common errors
      if (err.code === "auth/email-already-in-use") {
        setError("This email address is already registered.");
      } else if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        setError("Invalid email address or passcode.");
      } else if (err.code === "auth/weak-password") {
        setError("Password should be at least 6 characters.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address format.");
      } else {
        setError(err.message || "Authentication failed. Please verify credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black flex items-center justify-center p-4 selection:bg-teal-100 selection:text-teal-900 transition-colors duration-200" id="auth-container">
      <div className="w-full max-w-md bg-white dark:bg-zinc-950 rounded-2xl shadow-xl shadow-slate-100/50 dark:shadow-none border border-slate-100 dark:border-zinc-900 overflow-hidden relative transition-colors duration-200" id="auth-card">
        {/* Decorative Top Accent Bar */}
        <div className="h-1.5 bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500" />
        
        <div className="p-8">
          {/* Header Graphic */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-teal-50 dark:bg-teal-950/20 text-teal-600 mb-3 border border-teal-100 dark:border-zinc-800 shadow-sm">
              <HeartPulse className="w-8 h-8 animate-pulse text-emerald-500" />
            </div>
            <h1 className="text-2xl font-bold font-sans tracking-tight text-slate-800 dark:text-white flex items-center justify-center gap-1.5">
              MediScan <span className="text-emerald-500 font-extrabold">AI</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-xs mx-auto">
              Smart Medicine Recognition & Interactive Patient Guidance Platform
            </p>
          </div>

          <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-6 font-sans">
            {isRegister ? "Create Account" : "Welcome Back"}
          </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Full Name</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="John Doe"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950/40 transition-all outline-none text-sm text-slate-705 dark:text-white bg-slate-50/50 dark:bg-black font-sans"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Email Address</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950/40 transition-all outline-none text-sm text-slate-705 dark:text-white bg-slate-50/50 dark:bg-black font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Password</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950/40 transition-all outline-none text-sm text-slate-705 dark:text-white bg-slate-50/50 dark:bg-black font-sans"
                    id="password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none bg-transparent hover:bg-transparent border-none outline-none cursor-pointer p-0"
                    id="toggle-password-btn"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Response Alerts */}
              {error && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 rounded-xl flex items-start gap-2.5 text-xs text-rose-600 dark:text-rose-400">
                  <span className="font-semibold">Error:</span> {error}
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 rounded-xl flex items-center gap-2.5 text-xs text-emerald-750 dark:text-emerald-400">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Submit Mechanism */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-xl font-medium text-sm hover:opacity-95 active:scale-[0.99] transition-all shadow-md shadow-emerald-100/50 flex items-center justify-center gap-2 disabled:opacity-75 disabled:pointer-events-none cursor-pointer border-none"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : isRegister ? (
                  "Create Account"
                ) : (
                  "Sign In Safely"
                )}
              </button>
            </form>

          {/* Social login option */}
          <div className="relative my-5 flex items-center justify-center">
            <div className="absolute inset-x-0 h-px bg-slate-200 dark:bg-zinc-800" />
            <span className="relative bg-white dark:bg-zinc-950 px-3 text-slate-400 dark:text-zinc-500 text-[11px] font-medium uppercase tracking-wider font-mono">Or continue with</span>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-2.5 bg-white dark:bg-black border border-slate-200 dark:border-zinc-850 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-900 font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2.5 active:scale-[0.99] disabled:opacity-70 disabled:pointer-events-none cursor-pointer outline-none"
            id="google-signin-btn"
          >
            <svg className="w-4 h-4 shrink-0 animate-none" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22-.03-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Sign in with Google</span>
          </button>

          {/* Toggle Action */}
          <div className="mt-6 text-center text-xs text-slate-550 dark:text-slate-400">
            {isRegister ? "Already have an account?" : "New to MediScan AI?"}{" "}
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError(null);
                setSuccessMsg(null);
              }}
              className="text-teal-600 dark:text-teal-400 font-semibold hover:underline bg-transparent border-none outline-none cursor-pointer p-0"
            >
              {isRegister ? "Sign In" : "Register Free"}
            </button>
          </div>
        </div>

        {/* Footer info badge */}
        <div className="bg-slate-50 dark:bg-black py-3 px-8 border-t border-slate-100 dark:border-zinc-900 flex items-center justify-center gap-2 text-slate-400 dark:text-zinc-500 text-[10px]">
          <Shield className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
          <span>Real-time Secure Firebase Session Authentication active</span>
        </div>
      </div>
    </div>
  );
}
