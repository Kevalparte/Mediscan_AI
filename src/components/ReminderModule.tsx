import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  doc, 
  updateDoc, 
  query, 
  orderBy 
} from "firebase/firestore";
import { 
  Clock, 
  Plus, 
  Trash2, 
  Bell, 
  BellOff, 
  Calendar, 
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { Reminder } from "../types";

interface ReminderModuleProps {
  userId: string;
}

export default function ReminderModule({ userId }: ReminderModuleProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDosage, setFormDosage] = useState("");
  const [formTime, setFormTime] = useState("08:00");
  const [formFreq, setFormFreq] = useState<any>("Daily");
  const [formDays, setFormDays] = useState("Everyday");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // AM PM custom selectors
  const [hour12, setHour12] = useState("08");
  const [minute, setMinute] = useState("00");
  const [period, setPeriod] = useState("AM");

  // Keep formTime synced to the database-compatible "HH:MM" 24-hour style format
  useEffect(() => {
    let hrVal = parseInt(hour12, 10);
    if (period === "PM" && hrVal < 12) {
      hrVal += 12;
    } else if (period === "AM" && hrVal === 12) {
      hrVal = 0;
    }
    const hh = String(hrVal).padStart(2, "0");
    const mm = String(parseInt(minute, 10) || 0).padStart(2, "0");
    setFormTime(`${hh}:${mm}`);
  }, [hour12, minute, period]);

  const remindersRef = collection(db, "users", userId, "reminders");

  const fetchReminders = async () => {
    setLoading(true);
    let items: Reminder[] = [];

    // Checked LocalStorage cache first
    try {
      const localData = localStorage.getItem(`mediscan_reminders_${userId}`);
      if (localData) {
        items = JSON.parse(localData);
      }
    } catch (e) {
      console.error("Local storage reminders fetch failed:", e);
    }

    try {
      const q = query(remindersRef, orderBy("createdAt", "desc"));
      
      // Promise race with timeout to never hang user interface
      const dbTask = getDocs(q);
      const snapshot = await Promise.race([
        dbTask,
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Firestore database timeout")), 3000))
      ]);

      const firestoreItems: Reminder[] = [];
      snapshot.forEach((docSnapshot: any) => {
        firestoreItems.push({ id: docSnapshot.id, ...docSnapshot.data() } as Reminder);
      });

      if (firestoreItems.length > 0) {
        items = firestoreItems;
        // Update local storage to keep in sync
        localStorage.setItem(`mediscan_reminders_${userId}`, JSON.stringify(items));
      }
    } catch (err) {
      console.warn("Firestore reminders pull failed or timed out. Gracefully sticking to local cache:", err);
    } finally {
      setReminders(items);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReminders();
  }, [userId]);

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!formName.trim()) {
      setErrorMsg("Medicine name is required");
      return;
    }

    const tempId = "local_rem_" + Math.random().toString(36).substr(2, 9);
    const newReminderItem: Reminder = {
      id: tempId,
      userId,
      medicineName: formName,
      dosage: formDosage || "1 Tablet",
      time: formTime,
      frequency: formFreq,
      days: formDays,
      isActive: true,
      createdAt: new Date().toISOString()
    };

    // 1. Immediately update Local Storage & React state for instant UI responsiveness
    const updatedList = [newReminderItem, ...reminders];
    setReminders(updatedList);
    try {
      localStorage.setItem(`mediscan_reminders_${userId}`, JSON.stringify(updatedList));
    } catch (err) {
      console.error("Failed to write reminder to localStorage:", err);
    }

    // Reset Form
    setFormName("");
    setFormDosage("");
    setHour12("08");
    setMinute("00");
    setPeriod("AM");
    setFormFreq("Daily");
    setFormDays("Everyday");

    // 2. Save to Firestore in background (non-blocking)
    try {
      const addDocTask = addDoc(remindersRef, {
        userId,
        medicineName: newReminderItem.medicineName,
        dosage: newReminderItem.dosage,
        time: newReminderItem.time,
        frequency: newReminderItem.frequency,
        days: newReminderItem.days,
        isActive: newReminderItem.isActive,
        createdAt: newReminderItem.createdAt
      });

      await Promise.race([
        addDocTask,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore database timeout")), 3000))
      ]);
      
      // Refresh to fetch the real backend document id
      fetchReminders();
    } catch (err) {
      console.warn("Firestore write for reminder failed or timed out. Cached locally.", err);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const updatedStatus = !currentStatus;

    // 1. Instantly update React state and Local Storage
    const updatedList = reminders.map(rem => rem.id === id ? { ...rem, isActive: updatedStatus } : rem);
    setReminders(updatedList);
    try {
      localStorage.setItem(`mediscan_reminders_${userId}`, JSON.stringify(updatedList));
    } catch (err) {
      console.error("Local storage write error on toggle:", err);
    }

    // 2. Try Firestore in background asynchronously
    if (!id.startsWith("local_")) {
      try {
        const docRef = doc(db, "users", userId, "reminders", id);
        const updateTask = updateDoc(docRef, { isActive: updatedStatus });
        await Promise.race([
          updateTask,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore database timeout")), 3000))
        ]);
      } catch (err) {
        console.warn("Firestore reminder toggle failed. Locally preserved.", err);
      }
    }
  };

  const handleDelete = async (id: string) => {
    // 1. Instantly update React state and Local Storage
    const updatedList = reminders.filter(rem => rem.id !== id);
    setReminders(updatedList);
    try {
      localStorage.setItem(`mediscan_reminders_${userId}`, JSON.stringify(updatedList));
    } catch (err) {
      console.error("Local storage delete err on reminder:", err);
    }

    // 2. Try Firestore deletion in background asynchronously
    if (!id.startsWith("local_")) {
      try {
        const docRef = doc(db, "users", userId, "reminders", id);
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

  // Convert 24hr time format to readable 12hr AM/PM format
  const formatTimeToShow = (timeStr: string) => {
    try {
      const [hour, min] = timeStr.split(":");
      const hrNum = parseInt(hour, 10);
      const ampm = hrNum >= 12 ? "PM" : "AM";
      const adjustedHr = hrNum % 12 || 12;
      return `${adjustedHr}:${min} ${ampm}`;
    } catch (e) {
      return timeStr;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="reminders-container">
      {/* Form Scheduler Card */}
      <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-slate-100 dark:border-zinc-900 shadow-sm p-6 lg:col-span-1 h-fit">
        <h3 className="text-base font-bold font-sans text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-emerald-500" />
          Schedule Dose Reminder
        </h3>

        <form onSubmit={handleAddReminder} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1">Medicine Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Paracetamol, Metformin"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-zinc-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-105 transition-all outline-none text-slate-700 dark:text-zinc-100 bg-slate-50/50 dark:bg-black"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1">Dosage Amount</label>
            <input
              type="text"
              placeholder="e.g. 1 capsule, 500mg, 5ml"
              value={formDosage}
              onChange={(e) => setFormDosage(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-zinc-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-105 transition-all outline-none text-slate-700 dark:text-zinc-100 bg-slate-50/50 dark:bg-black"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1">Target Time (AM/PM)</label>
              <div className="flex gap-1">
                {/* Hour */}
                <select
                  value={hour12}
                  onChange={(e) => setHour12(e.target.value)}
                  className="w-1/3 px-1.5 py-2 rounded-xl text-xs border border-slate-200 dark:border-zinc-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-105 outline-none text-slate-700 dark:text-zinc-100 bg-slate-50/50 dark:bg-black cursor-pointer"
                >
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(val => (
                    <option key={val} value={val} className="dark:bg-black">{val}</option>
                  ))}
                </select>

                {/* Minute */}
                <select
                  value={minute}
                  onChange={(e) => setMinute(e.target.value)}
                  className="w-1/3 px-1.5 py-2 rounded-xl text-xs border border-slate-200 dark:border-zinc-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-105 outline-none text-slate-700 dark:text-zinc-100 bg-slate-50/50 dark:bg-black cursor-pointer"
                >
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(val => (
                    <option key={val} value={val} className="dark:bg-black">{val}</option>
                  ))}
                </select>

                {/* AM/PM */}
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-1/3 px-1.5 py-2 rounded-xl text-xs border border-slate-200 dark:border-zinc-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-105 outline-none text-slate-700 dark:text-zinc-100 bg-slate-50/50 dark:bg-black cursor-pointer"
                >
                  <option value="AM" className="dark:bg-black">AM</option>
                  <option value="PM" className="dark:bg-black">PM</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1">Frequency</label>
              <select
                value={formFreq}
                onChange={(e) => setFormFreq(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-zinc-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-105 transition-all outline-none text-slate-700 dark:text-zinc-100 bg-slate-50/50 dark:bg-black cursor-pointer"
              >
                <option value="Daily" className="dark:bg-black">Daily</option>
                <option value="Twice daily" className="dark:bg-black">Twice Daily</option>
                <option value="Weekly" className="dark:bg-black">Weekly</option>
                <option value="As needed" className="dark:bg-black">As Needed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1">Schedule Days</label>
            <input
              type="text"
              placeholder="e.g. Mon, Wed, Fri or Everyday"
              value={formDays}
              onChange={(e) => setFormDays(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-zinc-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-105 transition-all outline-none text-slate-700 dark:text-zinc-100 bg-slate-50/50 dark:bg-black"
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-xl text-xs font-semibold hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Reminder
          </button>
        </form>
      </div>

      {/* active Lists Card */}
      <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-slate-100 dark:border-zinc-900 shadow-sm p-6 lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold font-sans text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-500" />
            Dosage Schedule Calendar
          </h3>
          <span className="text-xs bg-slate-100 dark:bg-black text-slate-600 dark:text-zinc-450 hover:bg-slate-200 px-2.5 py-1 rounded-full border border-slate-200/50 dark:border-zinc-800">
            {reminders.length} Meds Active
          </span>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center items-center">
            <div className="w-8 h-8 border-2 border-slate-350 dark:border-zinc-750 border-t-teal-600 rounded-full animate-spin" />
          </div>
        ) : reminders.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center">
            <Bell className="w-10 h-10 text-slate-300 dark:text-zinc-650 animate-bounce mb-3" />
            <h4 className="text-sm font-semibold text-slate-700 dark:text-zinc-300">No active reminders set</h4>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-xs mx-auto">
              Configure daily, twice daily doses, and medical timelines using the scheduler panel
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
            {reminders.map((re) => (
              <div 
                key={re.id}
                className={`p-4 rounded-xl border transition-all duration-300 flex items-center justify-between gap-4 ${
                  re.isActive 
                    ? "bg-slate-50/50 dark:bg-zinc-900/40 border-slate-100 dark:border-zinc-850 shadow-sm hover:border-slate-200" 
                    : "bg-slate-50/20 dark:bg-zinc-950/20 border-slate-100/50 dark:border-zinc-900/60 opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-lg border shrink-0 ${
                    re.isActive ? "bg-teal-50 dark:bg-teal-950/40 border-teal-100 dark:border-teal-900/60 text-teal-600 dark:text-teal-400" : "bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-zinc-500"
                  }`}>
                    {re.isActive ? (
                      <Bell className="w-5 h-5 animate-pulse" />
                    ) : (
                      <BellOff className="w-5 h-5" />
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                      {re.medicineName}
                      <span className="text-[10px] font-mono tracking-wider font-semibold text-slate-400 dark:text-zinc-450 border border-slate-200/60 dark:border-zinc-800 bg-white dark:bg-black rounded px-1.5 py-0.5">
                        {re.dosage}
                      </span>
                    </h4>
                    
                    <div className="flex items-center gap-3 mt-1.5 text-slate-500 dark:text-zinc-400 text-xs flex-wrap">
                      <span className="font-mono bg-white dark:bg-black border border-slate-160 dark:border-zinc-800 rounded-md px-1.5 py-0.5 shadow-sm text-slate-650 dark:text-zinc-300 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                        {formatTimeToShow(re.time)}
                      </span>
                      <span>•</span>
                      <span className="capitalize">{re.frequency} ({re.days})</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Toggle Active status */}
                  <button
                    onClick={() => handleToggleActive(re.id, re.isActive)}
                    className={`p-1.5 rounded-lg border hover:scale-105 active:scale-95 transition-all cursor-pointer ${
                      re.isActive 
                        ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 hover:border-emerald-300 text-emerald-600 dark:text-emerald-400" 
                        : "bg-slate-100 dark:bg-zinc-900 border-slate-350 dark:border-zinc-800 hover:bg-slate-200 text-slate-500 dark:text-zinc-400"
                    }`}
                    title={re.isActive ? "Pause reminder" : "Resume reminder"}
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(re.id)}
                    className="p-1.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/60 hover:bg-rose-100 hover:border-rose-200 text-rose-600 dark:text-rose-450 rounded-lg shrink-0 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                    title="Delete Reminder permanently"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
