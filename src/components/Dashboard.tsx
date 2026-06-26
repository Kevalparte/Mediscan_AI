import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, getDocs, query, orderBy, deleteDoc, doc, limit, addDoc, getDoc, setDoc } from "firebase/firestore";
import { 
  HeartPulse, 
  LogOut, 
  History, 
  Trash2, 
  FileText, 
  CalendarRange, 
  BrainCircuit, 
  QrCode, 
  MessageSquareCode,
  User,
  Shield,
  Clock,
  ExternalLink,
  Search,
  Bell,
  X,
  Moon,
  Sun,
  Mail,
  Info,
  Save,
  Phone,
  ArrowLeft,
  Pencil,
  Check
} from "lucide-react";
import ScanModule from "./ScanModule";
import ReminderModule from "./ReminderModule";
import InteractionModule from "./InteractionModule";
import ChatModule from "./ChatModule";
import { ScanHistory, ScanResult } from "../types";

interface DashboardProps {
  user: any;
  onLogOut: () => void;
}

export default function Dashboard({ user, onLogOut }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<"scan" | "reminders" | "interactions" | "chat">("scan");
  const [historyList, setHistoryList] = useState<ScanHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedPastScan, setSelectedPastScan] = useState<ScanHistory | null>(null);
  const [chosenResultForScanTab, setChosenResultForScanTab] = useState<ScanResult | null>(null);

  const [activeAlerts, setActiveAlerts] = useState<{ id: string; medicineName: string; dosage: string; time: string }[]>([]);

  // Sidebar and custom profile / dark mode state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showProfileDetail, setShowProfileDetail] = useState(false);
  const [sidebarView, setSidebarView] = useState<"settings" | "profile" | "about" | "support" | "history">("settings");
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("mediscan_theme");
      if (stored) return stored === "dark";
    }
    return false;
  });

  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileAge, setProfileAge] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileConditions, setProfileConditions] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // States for inline profile field editing
  const [editingField, setEditingField] = useState<"name" | "phone" | "email" | "age" | null>(null);
  const [tempValue, setTempValue] = useState("");

  // Contacts
  const [contactSubject, setContactSubject] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [sendingContact, setSendingContact] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);

  // Load profile details from firestore
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const docRef = doc(db, "users", user.uid, "profile", "details");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setProfileName(data.name || user.displayName || "");
          setProfilePhone(data.phone || "");
          setProfileAge(data.age || "");
          setProfileConditions(data.conditions || "");
          setProfileEmail(data.email || user.email || "");
        } else {
          setProfileName(user.displayName || "");
          setProfileEmail(user.email || "");
        }
      } catch (err) {
        console.warn("Failed to retrieve profile info from Firestore on launch:", err);
        setProfileName(user.displayName || "");
        setProfileEmail(user.email || "");
      }
    };
    loadProfile();
  }, [user.uid, user.displayName, user.email]);

  // Handle saving detailed fields individually inside detailed foldout
  const handleSaveInlineField = async (field: "name" | "phone" | "email" | "age", value: string) => {
    try {
      const docRef = doc(db, "users", user.uid, "profile", "details");
      const updatedFields: any = {};
      
      if (field === "name") {
        setProfileName(value);
        updatedFields.name = value;
      } else if (field === "phone") {
        setProfilePhone(value);
        updatedFields.phone = value;
      } else if (field === "email") {
        setProfileEmail(value);
        updatedFields.email = value;
      } else if (field === "age") {
        setProfileAge(value);
        updatedFields.age = value;
      }
      
      await setDoc(docRef, {
        ...updatedFields,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      setEditingField(null);
    } catch (err) {
      console.error(`Failed to execute inline save for field: ${field}`, err);
    }
  };

  // Handle syncing dark theme to document root
  useEffect(() => {
    if (typeof window !== "undefined") {
      const root = window.document.documentElement;
      if (isDarkMode) {
        root.classList.add("dark");
        localStorage.setItem("mediscan_theme", "dark");
      } else {
        root.classList.remove("dark");
        localStorage.setItem("mediscan_theme", "light");
      }
    }
  }, [isDarkMode]);

  // Submit profile details
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccess(false);
    try {
      const docRef = doc(db, "users", user.uid, "profile", "details");
      await setDoc(docRef, {
        name: profileName,
        phone: profilePhone,
        age: profileAge,
        conditions: profileConditions,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to commit profile details update to firestore:", err);
    } finally {
      setSavingProfile(false);
    }
  };

  // Submit contact message
  const handleSendContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactSubject.trim() || !contactMessage.trim()) return;
    setSendingContact(true);
    setContactSuccess(false);
    try {
      const collectionRef = collection(db, "users", user.uid, "contacts");
      await addDoc(collectionRef, {
        userEmail: user.email,
        subject: contactSubject,
        message: contactMessage,
        createdAt: new Date().toISOString()
      });
      setContactSuccess(true);
      setContactSubject("");
      setContactMessage("");
      setTimeout(() => setContactSuccess(false), 4000);
    } catch (err) {
      console.error("Failed to dispatch contact query:", err);
    } finally {
      setSendingContact(false);
    }
  };

  // 1. Ask for device Web Notification permission on dashboard mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  // 2. Background interval checking local medication schedules
  useEffect(() => {
    const triggeredMinutes = new Set<string>();

    const checkReminders = () => {
      try {
        const storageKey = `mediscan_reminders_${user.uid}`;
        const localData = localStorage.getItem(storageKey);
        if (!localData) return;

        const reminders = JSON.parse(localData);
        if (!Array.isArray(reminders)) return;

        const now = new Date();
        const hr = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const currentTimeStr = `${hr}:${min}`;

        reminders.forEach((rem: any) => {
          if (!rem.isActive) return;
          if (rem.time === currentTimeStr) {
            const triggerKey = `${rem.id}_${now.toDateString()}_${currentTimeStr}`;
            if (!triggeredMinutes.has(triggerKey)) {
              triggeredMinutes.add(triggerKey);

              // Play verbal notification
              if (typeof window !== "undefined" && window.speechSynthesis) {
                const utterance = new SpeechSynthesisUtterance(`Reminder: It is time to take your dose of ${rem.medicineName}, ${rem.dosage}.`);
                utterance.rate = 0.95;
                window.speechSynthesis.speak(utterance);
              }

              // Play subtle chime sound
              try {
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                if (audioCtx) {
                  const osc = audioCtx.createOscillator();
                  const gain = audioCtx.createGain();
                  osc.type = "sine";
                  osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
                  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
                  osc.connect(gain);
                  gain.connect(audioCtx.destination);
                  osc.start();
                  osc.stop(audioCtx.currentTime + 0.5);
                }
              } catch (e) {
                console.warn("Audio Context beep failed:", e);
              }

              // System Web Notification API trigger
              if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                new Notification(`Dosage Reminder!`, {
                  body: `It's time to take ${rem.medicineName} (${rem.dosage}) scheduled for ${rem.time}.`,
                  tag: rem.id
                });
              }

              // Add to visual state to draw interactive widget alert
              setActiveAlerts(prev => [
                ...prev,
                {
                  id: rem.id + "_" + Date.now(),
                  medicineName: rem.medicineName,
                  dosage: rem.dosage,
                  time: rem.time
                }
              ]);
            }
          }
        });
      } catch (err) {
        console.error("Error running reminder checker:", err);
      }
    };

    // Check immediately and poll every 10 seconds
    checkReminders();
    const interval = setInterval(checkReminders, 10000);
    return () => clearInterval(interval);
  }, [user.uid]);

  const dismissAlert = (alertId: string) => {
    setActiveAlerts(prev => prev.filter(al => al.id !== alertId));
  };

  const [globalSearch, setGlobalSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleGlobalSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const queryStr = globalSearch.trim();
    if (!queryStr) return;

    setSearching(true);
    setSearchError(null);

    try {
      const response = await fetch("/api/search-medicine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicineName: queryStr })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to find clinical details.");
      }

      const data = await response.json();
      if (data.success && data.result) {
        const result = data.result;
        const timestamp = new Date().toISOString();
        const newHistoryItem: ScanHistory = {
          id: "local_search_" + Date.now(),
          userId: user.uid,
          scannedAt: timestamp,
          scanResult: {
            medicineName: result.medicineName || queryStr,
            purpose: result.purpose || "N/A",
            dosage: result.dosage || "N/A",
            sideEffects: result.sideEffects || "N/A",
            precautions: result.precautions || "N/A",
            isSafe: result.isSafe ?? true,
            severity: result.severity || "safe",
            medicines: undefined
          }
        };

        // 1. Instantly update history state and local storage cache
        const storageKey = `mediscan_history_${user.uid}`;
        const localData = localStorage.getItem(storageKey);
        let localItems = localData ? JSON.parse(localData) : [];
        localItems.unshift(newHistoryItem);
        localItems = localItems.slice(0, 15);
        localStorage.setItem(storageKey, JSON.stringify(localItems));
        
        setHistoryList(localItems);
        setChosenResultForScanTab(newHistoryItem.scanResult);
        setActiveTab("scan");
        setGlobalSearch(""); // clear search input upon success

        // 2. Sync to Firestore in the background
        try {
          const historyCollection = collection(db, "users", user.uid, "history");
          await addDoc(historyCollection, {
            medicineName: result.medicineName || queryStr,
            purpose: result.purpose || "N/A",
            dosage: result.dosage || "N/A",
            sideEffects: result.sideEffects || "N/A",
            precautions: result.precautions || "N/A",
            isSafe: result.isSafe ?? true,
            severity: result.severity || "safe",
            medicines: null,
            scannedAt: timestamp
          });
          // Refresh list to grab official document ID if possible
          fetchScanHistory();
        } catch (dbErr) {
          console.warn("Background Firestore search sync failed/timed-out:", dbErr);
        }
      } else {
        throw new Error("Invalid search result structure returned by clinical lookup services.");
      }
    } catch (err: any) {
      console.error("Global search error:", err);
      setSearchError(err.message || "An issue occurred while searching medicine details.");
    } finally {
      setSearching(false);
    }
  };

  const fetchScanHistory = async () => {
    setLoadingHistory(true);
    let items: ScanHistory[] = [];

    // 1. Instantly pull from LocalStorage cache
    try {
      const localData = localStorage.getItem(`mediscan_history_${user.uid}`);
      if (localData) {
        items = JSON.parse(localData);
      }
    } catch (e) {
      console.error("Error loading local storage history:", e);
    }

    // 2. Try drawing from Firestore with safety timeout
    try {
      const historyRef = collection(db, "users", user.uid, "history");
      const q = query(historyRef, orderBy("scannedAt", "desc"), limit(15));
      const getDocsTask = getDocs(q);

      const snapshot = await Promise.race([
        getDocsTask,
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Firestore database timeout")), 3000))
      ]);

      const firestoreItems: ScanHistory[] = [];
      snapshot.forEach((docSnapshot: any) => {
        const data = docSnapshot.data();
        firestoreItems.push({
          id: docSnapshot.id,
          userId: user.uid,
          imageUrl: data.imageUrl,
          scannedAt: data.scannedAt,
          scanResult: {
            medicineName: data.medicineName || "Unknown",
            purpose: data.purpose || "N/A",
            dosage: data.dosage || "N/A",
            sideEffects: data.sideEffects || "N/A",
            precautions: data.precautions || "N/A",
            isSafe: data.isSafe ?? true,
            severity: data.severity || "safe",
            medicines: data.medicines || null
          }
        });
      });

      if (firestoreItems.length > 0) {
        // Merge without duplicates, prioritizing FireStore records
        const merged = [...firestoreItems];
        items.forEach(localItem => {
          const exists = merged.some(f => 
            f.scanResult.medicineName === localItem.scanResult.medicineName &&
            Math.abs(new Date(f.scannedAt).getTime() - new Date(localItem.scannedAt).getTime()) < 60000
          );
          if (!exists) {
            merged.push(localItem);
          }
        });
        
        // Sort by date desc
        merged.sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime());
        items = merged.slice(0, 15);
        
        // Sync back to local storage
        localStorage.setItem(`mediscan_history_${user.uid}`, JSON.stringify(items));
      }
    } catch (err) {
      console.warn("Firestore history pull failed or timed out. Gracefully sticking to local cache:", err);
    } finally {
      setHistoryList(items);
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchScanHistory();
  }, [user.uid]);

  const handleDeleteHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering details modal

    // 1. Immediately delete from React state and Local Storage for instant feeling of deletion
    const updated = historyList.filter(item => item.id !== id);
    setHistoryList(updated);
    try {
      localStorage.setItem(`mediscan_history_${user.uid}`, JSON.stringify(updated));
    } catch (err) {
      console.error("Local storage delete error:", err);
    }

    // 2. Try Firestore deletion in background asynchronously
    if (!id.startsWith("local_")) {
      try {
        const docRef = doc(db, "users", user.uid, "history", id);
        const deleteTask = deleteDoc(docRef);
        await Promise.race([
          deleteTask,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore database timeout")), 3000))
        ]);
      } catch (err) {
        console.warn("Firestore delete failed. Locally purged.", err);
      }
    }
  };

  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 12) return "Good Morning";
    if (hours < 18) return "Good Afternoon";
    return "Good Evening";
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black flex flex-col font-sans selection:bg-teal-150 selection:text-teal-900 transition-colors duration-200" id="main-panel">
      
      {/* Dynamic Slide Drawer Sidebar */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end" id="sidebar-drawer-overlay">
          {/* Backdrop blur overlay */}
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] transition-opacity duration-300" 
            onClick={() => {
              setIsSidebarOpen(false);
              setSidebarView("settings");
            }} 
          />
          
          {/* Drawer Body sliding panel */}
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-950 h-full shadow-2xl z-10 flex flex-col border-l border-slate-100 dark:border-zinc-900 animate-in slide-in-from-right duration-200 overflow-y-auto">
            
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 dark:border-zinc-900 flex items-center justify-between bg-slate-50 dark:bg-zinc-950 sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 font-sans">
                    {sidebarView === "profile" ? "Health Profile" :
                     sidebarView === "about" ? "About MediScan" :
                     sidebarView === "support" ? "Support Desk" :
                     sidebarView === "history" ? "Activity History" :
                     "Profile & Settings"}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-sans">Personal Medical Space</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsSidebarOpen(false);
                  setSidebarView("settings");
                }}
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-500 hover:text-slate-800 dark:text-slate-450 dark:hover:text-slate-200 transition-all flex items-center justify-center border-none cursor-pointer outline-none"
                title="Close settings drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content inside Drawer */}
            {sidebarView === "profile" ? (
              /* Detailed Profile View Page */
              <div className="p-6 space-y-6 flex-1 animate-in fade-in duration-200">
                {/* Back button */}
                <button
                  type="button"
                  onClick={() => setSidebarView("settings")}
                  className="flex items-center gap-1.5 text-xs font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 transition-colors bg-transparent border-none cursor-pointer p-0 mb-4"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Settings
                </button>

                <div className="text-center py-4">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-teal-500 to-indigo-600 text-white flex items-center justify-center font-black text-3xl shadow-lg mx-auto uppercase">
                    {(profileName || user.displayName || user.email)[0]}
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-800 dark:text-white mt-3.5">
                    {profileName || user.displayName || user.email.split("@")[0]}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1 uppercase tracking-widest font-sans">User Profile</p>
                </div>

                <div className="space-y-4">
                  <div className="bg-slate-50/70 dark:bg-zinc-900/40 rounded-2xl border border-slate-100 dark:border-zinc-800 p-4 space-y-3.5">
                    <h4 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest border-b border-slate-200/60 dark:border-zinc-800 pb-2">
                       Personal details
                    </h4>

                     {/* Patient Name detail */}
                    <div className="flex justify-between items-center text-xs min-h-[32px]">
                      <span className="text-slate-500 dark:text-zinc-400 font-medium font-sans">Full Name:</span>
                      {editingField === "name" ? (
                        <div className="flex items-center gap-1">
                          <input 
                            type="text" 
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            className="px-2 py-0.5 max-w-[150px] text-xs border border-teal-500 rounded bg-white dark:bg-black text-slate-800 dark:text-white outline-none font-sans"
                            autoFocus
                          />
                          <button 
                            onClick={() => handleSaveInlineField("name", tempValue)}
                            className="p-1 hover:bg-emerald-50 dark:hover:bg-emerald-955/35 text-emerald-600 dark:text-emerald-400 rounded cursor-pointer border-none bg-transparent"
                            title="Save Full Name"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => setEditingField(null)}
                            className="p-1 hover:bg-rose-50 dark:hover:bg-rose-955/35 text-rose-600 dark:text-rose-400 rounded cursor-pointer border-none bg-transparent"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group">
                          <span className="font-semibold text-slate-800 dark:text-white font-sans">
                            {profileName || user.displayName || user.email.split("@")[0]}
                          </span>
                          <button 
                            onClick={() => {
                              setEditingField("name");
                              setTempValue(profileName || user.displayName || user.email.split("@")[0]);
                            }}
                            className="p-1 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors border-none bg-transparent cursor-pointer"
                            title="Edit Full Name"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Patient Phone detail */}
                    <div className="flex justify-between items-center text-xs min-h-[32px]">
                      <span className="text-slate-500 dark:text-zinc-400 font-medium font-sans">Phone Number:</span>
                      {editingField === "phone" ? (
                        <div className="flex items-center gap-1">
                          <input 
                            type="tel" 
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            className="px-2 py-0.5 max-w-[150px] text-xs border border-teal-500 rounded bg-white dark:bg-black text-slate-800 dark:text-white outline-none font-sans"
                            autoFocus
                          />
                          <button 
                            onClick={() => handleSaveInlineField("phone", tempValue)}
                            className="p-1 hover:bg-emerald-50 dark:hover:bg-emerald-955/35 text-emerald-600 dark:text-emerald-400 rounded cursor-pointer border-none bg-transparent"
                            title="Save Phone Number"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => setEditingField(null)}
                            className="p-1 hover:bg-rose-50 dark:hover:bg-rose-955/35 text-rose-600 dark:text-rose-400 rounded cursor-pointer border-none bg-transparent"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group">
                          <span className="font-semibold text-slate-800 dark:text-white font-sans">
                            {profilePhone || "Not specified"}
                          </span>
                          <button 
                            onClick={() => {
                              setEditingField("phone");
                              setTempValue(profilePhone);
                            }}
                            className="p-1 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors border-none bg-transparent cursor-pointer"
                            title="Edit Phone Number"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Patient Email detail */}
                    <div className="flex justify-between items-center text-xs min-h-[32px]">
                      <span className="text-slate-500 dark:text-zinc-400 font-medium font-sans">Registered Email:</span>
                      {editingField === "email" ? (
                        <div className="flex items-center gap-1">
                          <input 
                            type="email" 
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            className="px-2 py-0.5 max-w-[150px] text-xs border border-teal-500 rounded bg-white dark:bg-black text-slate-800 dark:text-white outline-none font-mono"
                            autoFocus
                          />
                          <button 
                            onClick={() => handleSaveInlineField("email", tempValue)}
                            className="p-1 hover:bg-emerald-50 dark:hover:bg-emerald-955/35 text-emerald-600 dark:text-emerald-400 rounded cursor-pointer border-none bg-transparent"
                            title="Save Email Address"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => setEditingField(null)}
                            className="p-1 hover:bg-rose-50 dark:hover:bg-rose-955/35 text-rose-600 dark:text-rose-400 rounded cursor-pointer border-none bg-transparent"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group">
                          <span className="font-semibold text-teal-605 dark:text-teal-400 font-mono text-[11px]">
                            {profileEmail || user.email}
                          </span>
                          <button 
                            onClick={() => {
                              setEditingField("email");
                              setTempValue(profileEmail || user.email);
                            }}
                            className="p-1 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors border-none bg-transparent cursor-pointer"
                            title="Edit Email Address"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Patient Age detail */}
                    <div className="flex justify-between items-center text-xs min-h-[32px]">
                      <span className="text-slate-500 dark:text-zinc-400 font-medium font-sans">Age:</span>
                      {editingField === "age" ? (
                        <div className="flex items-center gap-1">
                          <input 
                            type="number" 
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            className="px-2 py-0.5 max-w-[150px] text-xs border border-teal-500 rounded bg-white dark:bg-black text-slate-800 dark:text-white outline-none font-sans"
                            autoFocus
                          />
                          <button 
                            onClick={() => handleSaveInlineField("age", tempValue)}
                            className="p-1 hover:bg-emerald-50 dark:hover:bg-emerald-955/35 text-emerald-600 dark:text-emerald-400 rounded cursor-pointer border-none bg-transparent"
                            title="Save Age"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => setEditingField(null)}
                            className="p-1 hover:bg-rose-50 dark:hover:bg-rose-955/35 text-rose-600 dark:text-rose-400 rounded cursor-pointer border-none bg-transparent"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group">
                          <span className="font-semibold text-slate-800 dark:text-white font-sans">
                            {profileAge ? `${profileAge} Years` : "Not specified"}
                          </span>
                          <button 
                            onClick={() => {
                              setEditingField("age");
                              setTempValue(profileAge);
                            }}
                            className="p-1 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors border-none bg-transparent cursor-pointer"
                            title="Edit Age"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50/70 dark:bg-zinc-900/40 rounded-2xl border border-slate-100 dark:border-zinc-800 p-4 space-y-3">
                    <h4 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest border-b border-slate-200/60 dark:border-zinc-800 pb-2">
                      Account Status
                    </h4>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500 dark:text-zinc-400 font-medium font-sans">Account ID:</span>
                      <span className="font-mono text-[10px] text-slate-600 dark:text-zinc-400" title={user.uid}>
                        {user.uid.slice(0, 12)}...
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500 dark:text-zinc-400 font-medium font-sans">Verification:</span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-100/30 uppercase tracking-wider font-sans">
                        Verified Account
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : sidebarView === "about" ? (
              /* Detailed About View Page */
              <div className="p-6 space-y-6 flex-1 animate-in fade-in duration-200">
                {/* Back button */}
                <button
                  type="button"
                  onClick={() => setSidebarView("settings")}
                  className="flex items-center gap-1.5 text-xs font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 transition-colors bg-transparent border-none cursor-pointer p-0 mb-4"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Settings
                </button>

                <div className="bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-150 dark:border-zinc-800">
                    <HeartPulse className="w-5 h-5 text-emerald-500 animate-pulse" />
                    <h3 className="text-sm font-extrabold text-slate-800 dark:text-white font-sans">
                      MediScan <span className="text-emerald-500 font-black">AI</span>
                    </h3>
                  </div>
                  <p className="text-xs text-slate-650 dark:text-slate-300 leading-relaxed font-sans">
                    MediScan AI is an intuitive full-stack healthcare platform engineered in partnership with top clinical specialists.
                  </p>
                  <p className="text-xs text-slate-655 dark:text-slate-350 leading-relaxed font-sans">
                    Embodying our goal to elevate critical medicine safety, our app runs instant optical character recognition (OCR) bottle-scanning diagnostics, highlights drug-drug hazardous combinations, schedules voice dosage reminders, and offers AI Pharmacist consultation.
                  </p>
                  <div className="pt-2 text-[10px] text-slate-400 dark:text-slate-500 font-sans uppercase tracking-wider">
                    Secure & Confidential Health Assistant
                  </div>
                </div>
              </div>
            ) : sidebarView === "support" ? (
              /* Detailed Support View Page */
              <div className="p-6 space-y-6 flex-1 animate-in fade-in duration-200">
                {/* Back button */}
                <button
                  type="button"
                  onClick={() => setSidebarView("settings")}
                  className="flex items-center gap-1.5 text-xs font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 transition-colors bg-transparent border-none cursor-pointer p-0 mb-4"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Settings
                </button>

                <div className="bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-800 rounded-2xl p-5">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-1.5 font-sans">
                    <Mail className="w-4 h-4 text-emerald-600" />
                    Contact Support Desk
                  </h4>
                  <p className="text-[10px] text-slate-455 dark:text-slate-400 mb-4 font-sans">
                    Have questions or feedback? Submit a message directly to support.
                  </p>

                  <form onSubmit={handleSendContact} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Inquiry Subject</label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. Schedule Bug or UI Error"
                        value={contactSubject}
                        onChange={(e) => setContactSubject(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-zinc-800 bg-white dark:bg-black text-slate-800 dark:text-white focus:border-teal-500 focus:ring-1 focus:ring-teal-100 transition-all outline-none animate-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Your Message</label>
                      <textarea 
                        required
                        placeholder="Describe your issue or suggestions here..."
                        value={contactMessage}
                        onChange={(e) => setContactMessage(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-zinc-800 bg-white dark:bg-black text-slate-800 dark:text-white focus:border-teal-500 focus:ring-1 focus:ring-teal-100 transition-all outline-none resize-none animate-none"
                      />
                    </div>

                    {contactSuccess && (
                      <div className="p-2.5 bg-teal-50 dark:bg-teal-950/20 text-teal-850 dark:text-teal-400 border border-teal-100/30 rounded-xl text-center text-xs font-bold leading-tight animate-in fade-in">
                        ✓ Message received! Our support specialists will respond via email shortly.
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={sendingContact}
                      className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1 active:scale-95 disabled:opacity-50 cursor-pointer border-none font-sans"
                    >
                      {sendingContact ? "Sending Ticket..." : "Send Message"}
                    </button>
                  </form>
                </div>
              </div>
            ) : sidebarView === "history" ? (
              /* Detailed History View Page */
              <div className="p-6 space-y-6 flex-1 flex flex-col animate-in fade-in duration-200 overflow-y-auto">
                <div className="shrink-0">
                  {/* Back button */}
                  <button
                    type="button"
                    onClick={() => setSidebarView("settings")}
                    className="flex items-center gap-1.5 text-xs font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 transition-colors bg-transparent border-none cursor-pointer p-0 mb-4"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Settings
                  </button>
                </div>

                <div className="flex-1 min-h-0 flex flex-col">
                  <h3 className="text-xs font-bold font-sans text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-4 shrink-0">
                    <History className="w-4 h-4 text-teal-650" />
                    Scan & Search History
                  </h3>

                  {loadingHistory ? (
                    <div className="py-8 text-center flex justify-center items-center flex-1">
                      <div className="w-6 h-6 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
                    </div>
                  ) : historyList.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-8 text-center px-4">
                      <History className="w-8 h-8 text-slate-300 dark:text-zinc-700 mb-2" />
                      <p className="text-xs text-slate-400 italic">
                        No recent searches or scans recorded yet. Use search or upload medication images to start history log.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
                      {historyList.map((hist) => (
                        <div 
                          key={hist.id}
                          onClick={() => {
                            setChosenResultForScanTab(hist.scanResult);
                            setActiveTab("scan");
                            setIsSidebarOpen(false);
                            setSidebarView("settings");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="p-3 bg-slate-50/50 dark:bg-zinc-900/40 hover:bg-teal-50/20 dark:hover:bg-zinc-900 border border-slate-100 dark:border-zinc-800 hover:border-teal-200/40 dark:hover:border-teal-700/40 rounded-xl text-left cursor-pointer transition-all flex items-center justify-between gap-3 group duration-150 animate-in fade-in"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate group-hover:text-teal-850 dark:group-hover:text-teal-400 font-sans">
                              {hist.scanResult.medicineName}
                            </p>
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                              {new Date(hist.scannedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                              hist.scanResult.severity === "safe" ? "bg-emerald-500" :
                              hist.scanResult.severity === "caution" ? "bg-amber-500" : "bg-rose-500"
                            }`} title={`Severity: ${hist.scanResult.severity || 'safe'}`} />
                            <button
                              onClick={(e) => handleDeleteHistory(hist.id, e)}
                              className="p-1 text-slate-405 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors bg-transparent border-none outline-none cursor-pointer"
                              title="Delete history item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Original Settings & Info, but with Profile Edit completely removed */
              <div className="p-6 space-y-5 flex-1 animate-in fade-in duration-200">
                
                {/* Profile Overview Card */}
                <div 
                  onClick={() => setSidebarView("profile")}
                  className="bg-gradient-to-tr from-teal-500/10 to-indigo-500/10 dark:from-teal-950/20 dark:to-indigo-950/20 rounded-2xl p-4 border border-teal-500/10 dark:border-teal-900/30 flex items-center gap-3.5 cursor-pointer hover:shadow-md hover:from-teal-500/15 hover:to-indigo-500/15 transition-all group"
                  title="Click to view health profile and settings"
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-555 to-indigo-650 text-white flex items-center justify-center font-black text-lg shadow-md shrink-0 uppercase bg-teal-600 group-hover:scale-105 transition-transform duration-200">
                    {(profileName || user.displayName || user.email)[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-teal-855 dark:text-teal-400 font-sans tracking-wider uppercase flex items-center gap-1">
                      {getGreeting()}! <span className="text-teal-550 dark:text-teal-500 group-hover:translate-x-1 transition-transform">→</span>
                    </h4>
                    <p className="text-sm font-extrabold text-slate-855 dark:text-slate-100 truncate mt-0.5 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                      {profileName || user.displayName || user.email.split("@")[0]}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-455 truncate mt-0.5 font-sans">Click to open profile details</p>
                  </div>
                </div>

                {/* Theme Settings Widget (Dark Mode Toggle) */}
                <div className="bg-slate-50 dark:bg-zinc-900/60 border border-slate-105 dark:border-zinc-800 rounded-2xl p-5">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 mb-3 font-sans">
                    {isDarkMode ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                    Theme & Aesthetics
                  </h4>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-slate-655 dark:text-slate-400 font-sans">
                      Enable Dark Mode visual theme
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer border-none outline-none ${
                        isDarkMode ? "bg-teal-500" : "bg-slate-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          isDarkMode ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* About Card Button */}
                <button
                  type="button"
                  onClick={() => setSidebarView("about")}
                  className="w-full text-left bg-slate-50 dark:bg-zinc-900/60 hover:bg-slate-100 dark:hover:bg-zinc-900 border border-slate-105 dark:border-zinc-800 rounded-2xl p-5 transition-all outline-none flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex-1 pr-2">
                    <h4 className="text-xs font-bold text-slate-705 dark:text-slate-300 flex items-center gap-2 mb-1.5 font-sans">
                      <Info className="w-4 h-4 text-indigo-500" />
                      About MediScan AI
                    </h4>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                      Learn about our medical safety platform
                    </span>
                  </div>
                  <span className="text-slate-400 group-hover:translate-x-1 transition-transform text-sm font-bold">→</span>
                </button>

                {/* Support Card Button */}
                <button
                  type="button"
                  onClick={() => setSidebarView("support")}
                  className="w-full text-left bg-slate-50 dark:bg-zinc-900/60 hover:bg-slate-100 dark:hover:bg-zinc-900 border border-slate-105 dark:border-zinc-800 rounded-2xl p-5 transition-all outline-none flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex-1 pr-2">
                    <h4 className="text-xs font-bold text-slate-705 dark:text-slate-300 flex items-center gap-2 mb-1.5 font-sans">
                      <Mail className="w-4 h-4 text-emerald-600" />
                      Contact Support Desk
                    </h4>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                      Submit support ticket or inquiry
                    </span>
                  </div>
                  <span className="text-slate-400 group-hover:translate-x-1 transition-transform text-sm font-bold">→</span>
                </button>

                {/* History Card Button */}
                <button
                  type="button"
                  onClick={() => setSidebarView("history")}
                  className="w-full text-left bg-slate-50 dark:bg-zinc-900/60 hover:bg-slate-100 dark:hover:bg-zinc-900 border border-slate-105 dark:border-zinc-800 rounded-2xl p-5 transition-all outline-none flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex-1 pr-2">
                    <h4 className="text-xs font-bold text-slate-705 dark:text-slate-300 flex items-center gap-2 mb-1.5 font-sans">
                      <History className="w-4 h-4 text-teal-650" />
                      Activity History Logs
                    </h4>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                      View recent scans & searches ({historyList.length})
                    </span>
                  </div>
                  <span className="text-slate-400 group-hover:translate-x-1 transition-transform text-sm font-bold">→</span>
                </button>

                {/* End of drawer content spacing */}
                <div className="pt-2" />
              </div>
            )}

            {/* Sticky Drawer Footer with Log Out */}
            <div className="p-5 border-t border-slate-100 dark:border-zinc-900 bg-slate-50 dark:bg-zinc-950 sticky bottom-0 z-10">
              <button
                onClick={onLogOut}
                className="w-full py-2.5 px-4 bg-rose-50 hover:bg-rose-100 dark:bg-rose-955/35 dark:hover:bg-rose-955/40 text-rose-600 dark:text-rose-400 hover:text-rose-700 border border-rose-100 dark:border-rose-900/60 rounded-xl text-xs font-bold flex items-center justify-center gap-2.5 transition-all outline-none active:scale-95 cursor-pointer"
                title="Sign Out of active user profile session"
              >
                <LogOut className="w-4 h-4" />
                Sign Out of Profile
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Interactive Triggered Medication Dosage Alerts Container */}
      {activeAlerts.length > 0 && (
        <div className="fixed top-20 right-4 z-[99] flex flex-col gap-3 max-w-sm w-full animate-in fade-in slide-in-from-right-5">
          {activeAlerts.map(alert => (
            <div 
              key={alert.id}
              className="bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-teal-500/30 flex items-start gap-3 relative overflow-hidden"
              id={`alert-toast-${alert.id}`}
            >
              {/* Background ambient teal pulse */}
              <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-teal-500 via-emerald-500 to-indigo-500 animate-pulse" />

              <div className="p-2 bg-teal-500/20 rounded-xl text-teal-400 shrink-0">
                <Bell className="w-5 h-5 animate-bounce" />
              </div>

              <div className="flex-1 min-w-0 pr-6">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold tracking-wider text-teal-400 uppercase">Dosage Warning</span>
                  <span className="text-[10px] text-slate-400 font-mono">• {alert.time}</span>
                </div>
                <h4 className="text-xs font-bold mt-1 text-white truncate">{alert.medicineName}</h4>
                <p className="text-[11px] text-slate-300 mt-0.5">Time to take your scheduled dose ({alert.dosage}). Please mark as taken.</p>
                <div className="mt-3 flex gap-2">
                  <button 
                    onClick={() => dismissAlert(alert.id)}
                    className="px-3 py-1 bg-teal-500 hover:bg-emerald-500 text-slate-950 text-[10px] font-extrabold rounded-lg shadow transition-all active:scale-95 cursor-pointer border-none font-sans"
                  >
                    Mark as Taken
                  </button>
                  <button 
                    onClick={() => dismissAlert(alert.id)}
                    className="px-2 py-1 bg-transparent hover:bg-white/10 text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer border border-white/20 font-sans"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              <button 
                onClick={() => dismissAlert(alert.id)}
                className="absolute top-3 right-3 text-slate-400 hover:text-white bg-transparent border-none cursor-pointer outline-none text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Decorative colored glow row */}
      <div className="h-1 bg-gradient-to-r from-teal-500 via-emerald-500 to-indigo-500 w-full" />

      {/* Main Bar */}
      <header className="bg-white dark:bg-zinc-950 dark:border-zinc-900 border-b border-slate-100 dark:border-zinc-900 w-full px-6 py-4 sticky top-0 z-10 shadow-sm shadow-slate-100/30 dark:shadow-none transition-colors duration-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-teal-50/60 dark:bg-teal-950/20 rounded-xl flex items-center justify-center border border-teal-100 dark:border-zinc-800 text-teal-600">
              <HeartPulse className="w-5 h-5 text-emerald-500 animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-1">
                MediScan <span className="text-emerald-500 font-extrabold">AI</span>
              </h1>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-sans uppercase tracking-wider">Smart Health Assistant</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Clickable Name and Avatar in Top Right corner */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="flex items-center gap-3 text-right bg-slate-50 hover:bg-teal-50/70 p-1.5 pr-3 pl-2 rounded-2xl border border-slate-150 dark:bg-zinc-900 dark:border-zinc-800 hover:border-teal-200/50 dark:hover:bg-zinc-850 dark:hover:border-teal-900/50 transition-all outline-none cursor-pointer"
              title="Click to expand settings, updatable profile, contact, and preferences"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-teal-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm shrink-0">
                {(profileName || user.displayName || user.email)[0]}
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 justify-end">
                  {profileName || user.displayName || user.email.split("@")[0]}
                </p>
                <p className="text-[9px] text-slate-400 dark:text-slate-400 font-medium font-mono">{user.email}</p>
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* Horizontal Nav bar - On top of Search bar */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6">
        <nav className="bg-white dark:bg-zinc-950 rounded-2xl border border-slate-100 dark:border-zinc-900 shadow-sm p-2 flex flex-row flex-wrap items-center justify-center gap-2" id="tab-nav">
          <button
            onClick={() => {
              setActiveTab("scan");
              setChosenResultForScanTab(null); // click tab directly to clear chosen and allow standard upload/OCR
            }}
            className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-bold text-center transition-all flex items-center justify-center gap-2.5 ${
              activeTab === "scan" 
                ? "bg-teal-50/75 text-teal-800 dark:bg-zinc-900 dark:text-teal-300 shadow-sm" 
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50/50 dark:text-zinc-400 dark:hover:text-slate-200 dark:hover:bg-zinc-900/60 bg-transparent"
            }`}
          >
            <QrCode className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Medicine Scan & OCR</span>
          </button>

          <button
            onClick={() => setActiveTab("reminders")}
            className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-bold text-center transition-all flex items-center justify-center gap-2.5 ${
              activeTab === "reminders" 
                ? "bg-teal-50/75 text-teal-800 dark:bg-zinc-900 dark:text-teal-300 shadow-sm" 
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50/50 dark:text-zinc-400 dark:hover:text-slate-200 dark:hover:bg-zinc-900/60 bg-transparent"
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Dosage Reminders</span>
          </button>

          <button
            onClick={() => setActiveTab("interactions")}
            className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-bold text-center transition-all flex items-center justify-center gap-2.5 ${
              activeTab === "interactions" 
                ? "bg-teal-50/75 text-teal-800 dark:bg-zinc-900 dark:text-teal-300 shadow-sm" 
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50/50 dark:text-zinc-400 dark:hover:text-slate-200 dark:hover:bg-zinc-900/60 bg-transparent"
            }`}
          >
            <BrainCircuit className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Drug Interactions</span>
          </button>

          <button
            onClick={() => setActiveTab("chat")}
            className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-bold text-center transition-all flex items-center justify-center gap-2.5 ${
              activeTab === "chat" 
                ? "bg-teal-50/75 text-teal-800 dark:bg-zinc-900 dark:text-teal-300 shadow-sm" 
                : "text-slate-505 hover:text-slate-850 hover:bg-slate-50/50 dark:text-zinc-400 dark:hover:text-slate-200 dark:hover:bg-zinc-900/60 bg-transparent"
            }`}
          >
            <MessageSquareCode className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">AI Pharmacist Chat</span>
          </button>
        </nav>
      </div>

      {/* Universal Medicine Search Header Block */}
      {activeTab === "scan" && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-slate-100 dark:border-zinc-900 p-5 shadow-sm shadow-slate-100/30 dark:shadow-none">
            <div className="flex items-center justify-center">
              <form onSubmit={handleGlobalSearchSubmit} className="w-full max-w-2xl flex gap-2 relative">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Type any medicine name (e.g., Aspirin, Metformin, Amoxicillin)..."
                    value={globalSearch}
                    onChange={(e) => {
                      setGlobalSearch(e.target.value);
                      if (searchError) setSearchError(null);
                    }}
                    disabled={searching}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs border border-slate-200 dark:border-zinc-850 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900/30 transition-all outline-none text-slate-700 dark:text-white bg-slate-50/50 dark:bg-black font-sans shadow-sm"
                    id="universal-medicine-search"
                  />
                  <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                  </span>
                </div>
                
                <button
                  type="submit"
                  disabled={searching}
                  className="px-4 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:opacity-95 text-white text-xs font-bold rounded-xl active:scale-95 transition-all outline-none shadow-sm cursor-pointer shrink-0 inline-flex items-center justify-center gap-1.5 min-w-[95px] border-none"
                >
                  {searching ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Searching...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      <span>Search</span>
                    </>
                  )}
                </button>
              </form>
            </div>
            {searchError && (
              <div className="mt-2.5 max-w-2xl mx-auto text-xs text-rose-600 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 px-3 py-1.5 rounded-lg flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1">
                <span>⚠️ Error: {searchError}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Primary Workspace Dashboard Layout wrapper */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        {/* Dynamic active Module stage taking full width of the screen */}
        <section className="w-full" id="active-tab-stage">
          {activeTab === "scan" && (
            <ScanModule 
              userId={user.uid} 
              onNewScanSaved={fetchScanHistory} 
              initialResult={chosenResultForScanTab}
              onClearResult={() => setChosenResultForScanTab(null)}
            />
          )}
          {activeTab === "reminders" && <ReminderModule userId={user.uid} />}
          {activeTab === "interactions" && <InteractionModule />}
          {activeTab === "chat" && <ChatModule userId={user.uid} />}
        </section>

        {/* Past Scans & History Log - Last Section of Dashboard, visible only on scan tab */}
        {activeTab === "scan" && (
          <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-slate-100 dark:border-zinc-900 shadow-sm p-5 flex flex-col w-full" id="recent-scans-footer-section">
            <div className="flex items-center justify-between gap-2 mb-4 shrink-0">
              <h3 className="text-xs font-bold font-sans text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <History className="w-4 h-4 text-teal-650" />
                Recent Scans & Search History Log
              </h3>
              {historyList.length > 6 && (
                <button
                  type="button"
                  onClick={() => {
                    setSidebarView("history");
                    setIsSidebarOpen(true);
                  }}
                  className="text-xs font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 transition-colors bg-transparent border-none cursor-pointer flex items-center gap-1 font-sans"
                >
                  View All ({historyList.length}) →
                </button>
              )}
            </div>

            {loadingHistory ? (
              <div className="py-8 text-center flex justify-center">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
              </div>
            ) : historyList.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6">
                No recent searches or scans recorded yet. Use search or upload medication images to start history log.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {historyList.slice(0, 6).map((hist) => (
                  <div 
                    key={hist.id}
                    onClick={() => {
                      setChosenResultForScanTab(hist.scanResult);
                      setActiveTab("scan");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="p-3 bg-slate-50/50 dark:bg-black hover:bg-teal-50/20 dark:hover:bg-zinc-900 border border-slate-105 dark:border-zinc-800 hover:border-teal-200/40 dark:hover:border-teal-700/40 rounded-xl text-left cursor-pointer transition-all flex items-center justify-between gap-3 group duration-150 animate-in fade-in"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate group-hover:text-teal-800 dark:group-hover:text-teal-400">
                        {hist.scanResult.medicineName}
                      </p>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 font-mono mt-1">
                        {new Date(hist.scannedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                        hist.scanResult.severity === "safe" ? "bg-emerald-500" :
                        hist.scanResult.severity === "caution" ? "bg-amber-500" : "bg-rose-500"
                      }`} title={`Severity: ${hist.scanResult.severity || 'safe'}`} />
                      <button
                        onClick={(e) => handleDeleteHistory(hist.id, e)}
                        className="p-1 text-slate-405 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors bg-transparent border-none outline-none cursor-pointer"
                        title="Delete profile history item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

       {/* Details Dialog Modal for Historical items loaded */}
      {selectedPastScan && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-300">
          <div className="w-full max-w-xl bg-white dark:bg-zinc-950 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-zinc-900 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className={`p-5 flex items-start justify-between ${
              selectedPastScan.scanResult.severity === "safe" ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-400 border-b border-emerald-100/50 dark:border-zinc-805" :
              selectedPastScan.scanResult.severity === "caution" ? "bg-amber-500/10 text-amber-900 dark:text-amber-400 border-b border-amber-100/50 dark:border-zinc-805" :
              "bg-rose-500/10 text-rose-900 dark:text-rose-400 border-b border-rose-100/50 dark:border-zinc-805"
            }`}>
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Scan Ledger Entry</span>
                <h3 className="text-lg font-bold mt-1 text-slate-800 dark:text-slate-100">{selectedPastScan.scanResult.medicineName}</h3>
              </div>
              <button 
                onClick={() => setSelectedPastScan(null)}
                className="text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-bold text-sm bg-transparent border-none cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* details body */}
            <div className="p-5 space-y-5 max-h-[420px] overflow-y-auto">
              {selectedPastScan.scanResult.medicines && selectedPastScan.scanResult.medicines.length > 0 ? (
                <div className="space-y-5">
                  {selectedPastScan.scanResult.medicines.map((med, index) => (
                    <div key={index} className="border border-slate-100 dark:border-zinc-900 rounded-xl p-4 bg-slate-50/50 dark:bg-black space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-zinc-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-teal-50 dark:bg-teal-950/20 text-teal-700 dark:text-teal-400 border border-teal-100 dark:border-teal-900 text-[10px] font-bold flex items-center justify-center font-mono">
                            {index + 1}
                          </span>
                          <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{med.name}</h4>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          (med.severity || "safe") === "safe" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-450 border border-emerald-100" :
                          (med.severity || "safe") === "caution" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-450 border border-amber-100" :
                          "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-455 border border-rose-100"
                        }`}>
                          {med.severity || "safe"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="font-bold text-slate-400 dark:text-slate-500 text-[9px] uppercase tracking-wider block font-mono">Purpose</span>
                          <span className="text-slate-700 dark:text-slate-300">{med.purpose}</span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-400 dark:text-slate-500 text-[9px] uppercase tracking-wider block font-mono">Dosage & Frequency</span>
                          <span className="text-slate-700 dark:text-slate-300 whitespace-pre-line">{med.dosage}</span>
                        </div>
                        <div>
                          <span className="font-bold text-rose-500 dark:text-rose-400 text-[9px] uppercase tracking-wider block font-mono">Side Effects</span>
                          <span className="text-slate-700 dark:text-slate-300 whitespace-pre-line">{med.sideEffects}</span>
                        </div>
                        <div>
                          <span className="font-bold text-amber-500 dark:text-amber-400 text-[9px] uppercase tracking-wider block font-mono">Precautions</span>
                          <span className="text-slate-700 dark:text-slate-300 whitespace-pre-line">{med.precautions}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 font-mono">Indications & Purpose</h4>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">{selectedPastScan.scanResult.purpose}</p>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 font-mono">Recommended Dosages</h4>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">{selectedPastScan.scanResult.dosage}</p>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 font-mono">Precautionary Alerts</h4>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">{selectedPastScan.scanResult.precautions}</p>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 font-mono">Known Side Effects</h4>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">{selectedPastScan.scanResult.sideEffects}</p>
                  </div>
                </>
              )}
            </div>

            <div className="bg-slate-50 dark:bg-black p-4 border-t border-slate-100 dark:border-zinc-900 text-right">
              <button
                onClick={() => setSelectedPastScan(null)}
                className="py-1.5 px-4 bg-slate-800 dark:bg-zinc-900 hover:bg-slate-900 dark:hover:bg-zinc-800 text-white font-semibold rounded-lg text-xs transition-all outline-none border-none cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
