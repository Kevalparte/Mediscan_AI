import React, { useState, useRef, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { 
  Camera, 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Volume2, 
  VolumeX, 
  CornerDownRight, 
  Activity, 
  Sparkles,
  Info
} from "lucide-react";
import { ScanResult } from "../types";

interface ScanModuleProps {
  userId: string;
  onNewScanSaved: () => void;
  initialResult?: ScanResult | null;
  onClearResult?: () => void;
}

export default function ScanModule({ userId, onNewScanSaved, initialResult, onClearResult }: ScanModuleProps) {
  const [loading, setLoading] = useState(false);
  const [analysisStep, setAnalysisStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [isPrescription, setIsPrescription] = useState(false);
  
  // Display fields for translated results rendering
  const [displayFields, setDisplayFields] = useState({
    purpose: "",
    dosage: "",
    sideEffects: "",
    precautions: ""
  });
  const [translating, setTranslating] = useState(false);
  const [translatedMedicines, setTranslatedMedicines] = useState<any[] | null>(null);

  // Audio Speech state
  const [speechActive, setSpeechActive] = useState(false);
  const [speakLanguage, setSpeakLanguage] = useState<"en" | "hi" | "mr">("en");
  const [spokenText, setSpokenText] = useState("");

  // Sync initialResult from Dashboard (e.g., from Universal Medicine Search or History clicking)
  useEffect(() => {
    if (initialResult) {
      setResult(initialResult);
      setTranslatedMedicines(initialResult.medicines || null);
      setDisplayFields({
        purpose: initialResult.purpose || "",
        dosage: initialResult.dosage || "",
        sideEffects: initialResult.sideEffects || "",
        precautions: initialResult.precautions || ""
      });
      // Reset speech/translation states
      setSpeakLanguage("en");
      setSpeechActive(false);
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  }, [initialResult]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Warm-up SpeechSynthesis voices in background so they are ready
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices(); // initial triggers
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
      return () => {
        window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
      };
    }
  }, []);

  // Read upload and convert to base64
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      await processScanImage(base64Data);
    };
    reader.onerror = () => {
      setError("Failed to convert image file into readable format.");
    };
    reader.readAsDataURL(file);
  };

  // Perform backend analysis without artificial sleep delays
  const processScanImage = async (base64Image: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSpeechActive(false);
    window.speechSynthesis.cancel(); // cancel any ongoing speech

    try {
      setAnalysisStep("Extracting text markings & querying FDA safety databases...");
      
      const response = await fetch("/api/scan-tablet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64Image,
          isPrescriptionOnly: isPrescription
        })
      });

      if (!response.ok) {
        const errDetail = await response.json().catch(() => ({}));
        throw new Error(errDetail.error || "Server processing error");
      }

      const scanResult: ScanResult = await response.json();
      setResult(scanResult);
      setTranslatedMedicines(scanResult.medicines || null);
      setDisplayFields({
        purpose: scanResult.purpose || "",
        dosage: scanResult.dosage || "",
        sideEffects: scanResult.sideEffects || "",
        precautions: scanResult.precautions || ""
      });
      setSpeakLanguage("en");

      // Instantly dismiss loading screen so results view instantly!
      setLoading(false);
      setAnalysisStep("");

      // Background, non-blocking dual-layer persistence save
      saveScanToHistory(scanResult);
    } catch (err: any) {
      console.error("Scanning error:", err);
      setError(err.message || "We encountered an error analyzing that image. Please try again with a clearer picture.");
      setLoading(false);
      setAnalysisStep("");
    }
  };

  // Safe dual-layer fallback storage saver
  const saveScanToHistory = async (scanResult: ScanResult) => {
    const timestamp = new Date().toISOString();
    const tempId = "local_scan_" + Math.random().toString(36).substr(2, 9);

    const newHistoryItem = {
      id: tempId,
      userId: userId,
      scannedAt: timestamp,
      scanResult: {
        medicineName: scanResult.medicineName || "Unknown",
        purpose: scanResult.purpose || "N/A",
        dosage: scanResult.dosage || "N/A",
        sideEffects: scanResult.sideEffects || "N/A",
        precautions: scanResult.precautions || "N/A",
        isSafe: scanResult.isSafe ?? true,
        severity: scanResult.severity || "safe",
        medicines: scanResult.medicines || null
      }
    };

    // 1. Immediately write to Local Storage so the layout list is updated instantly
    try {
      const storageKey = `mediscan_history_${userId}`;
      const localData = localStorage.getItem(storageKey);
      let localItems = localData ? JSON.parse(localData) : [];
      localItems.unshift(newHistoryItem);
      localItems = localItems.slice(0, 15);
      localStorage.setItem(storageKey, JSON.stringify(localItems));
      
      // Notify parent Dashboard view to list updated items
      onNewScanSaved();
    } catch (e) {
      console.error("Error writing local history cache:", e);
    }

    // 2. Safely sync to Firebase Firestore with a 3.5s timeout race
    try {
      const historyCollection = collection(db, "users", userId, "history");
      const firestoreSaveTask = addDoc(historyCollection, {
        medicineName: scanResult.medicineName,
        purpose: scanResult.purpose,
        dosage: scanResult.dosage,
        sideEffects: scanResult.sideEffects,
        precautions: scanResult.precautions,
        isSafe: scanResult.isSafe,
        severity: scanResult.severity,
        medicines: scanResult.medicines || null,
        scannedAt: timestamp
      });

      await Promise.race([
        firestoreSaveTask,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore write timed out")), 3500))
      ]);

      console.log("Mediscan synchronized with Cloud Firestore successfully!");
      // Re-trigger history list to update temporary id with real document id
      onNewScanSaved();
    } catch (firestoreErr) {
      console.warn("Firestore save failed or timed out. Cached locally on browser:", firestoreErr);
    }
  };

  // Live on-the-fly translation for Hindi & Marathi
  const handleLanguageChange = async (newLang: "en" | "hi" | "mr") => {
    setSpeakLanguage(newLang);
    if (!result) return;

    if (speechActive) {
      window.speechSynthesis.cancel();
      setSpeechActive(false);
    }

    if (newLang === "en") {
      setDisplayFields({
        purpose: result.purpose || "",
        dosage: result.dosage || "",
        sideEffects: result.sideEffects || "",
        precautions: result.precautions || ""
      });
      setTranslatedMedicines(result.medicines || null);
      return;
    }

    setTranslating(true);
    try {
      const response = await fetch("/api/translate-medicine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: result.purpose,
          dosage: result.dosage,
          sideEffects: result.sideEffects,
          precautions: result.precautions,
          targetLang: newLang,
          medicines: result.medicines || null
        })
      });

      if (!response.ok) {
        throw new Error("Translation failed");
      }

      const translatedData = await response.json();
      if (translatedData.medicines) {
        setTranslatedMedicines(translatedData.medicines);
      }
      setDisplayFields({
        purpose: translatedData.purpose || "",
        dosage: translatedData.dosage || "",
        sideEffects: translatedData.sideEffects || "",
        precautions: translatedData.precautions || ""
      });
    } catch (err) {
      console.error("Live translation error:", err);
    } finally {
      setTranslating(false);
    }
  };

  // Speaks details in corresponding locale
  const handleSpeak = () => {
    if (!result) return;

    if (typeof window === "undefined" || !window.speechSynthesis) {
      console.warn("SpeechSynthesis is not supported in this browser.");
      return;
    }

    if (speechActive) {
      window.speechSynthesis.cancel();
      setSpeechActive(false);
      return;
    }

    let rawText = "";
    if (translatedMedicines && translatedMedicines.length > 0) {
      if (speakLanguage === "hi") {
        rawText = `इस पर्चे में ${translatedMedicines.length} दवाएं मिली हैं। ` + 
          translatedMedicines.map((m, idx) => 
            `दवा नंबर ${idx + 1}: ${m.name || "अज्ञात"}। उपयोग: ${m.purpose || "जानकारी नहीं"}। खुराक और सेवन: ${m.dosage || "जानकारी नहीं"}। दुष्प्रभाव और साइड इफेक्ट्स: ${m.sideEffects || "कोई नहीं"}। सावधानियां और चेतावनी: ${m.precautions || "कोई नहीं"}।`
          ).join(" ");
      } else if (speakLanguage === "mr") {
        rawText = `या औषधोपचारात ${translatedMedicines.length} औषधे आढळली आहेत। ` + 
          translatedMedicines.map((m, idx) => 
            `औषध क्रमांक ${idx + 1}: ${m.name || "अज्ञात"}। वापर: ${m.purpose || "माहिती नाही"}। डोस आणि सूचना: ${m.dosage || "माहिती नाही"}। दुष्परिणाम आणि साईड इफेक्ट्स: ${m.sideEffects || "काही नाही"}। दक्षता आणि खबरदारी: ${m.precautions || "काही नाही"}।`
          ).join(" ");
      } else {
        rawText = `This prescription contains ${translatedMedicines.length} medicines. ` + 
          translatedMedicines.map((m, idx) => 
            `Medicine ${idx + 1}: ${m.name || "Unknown"}. Purpose: ${m.purpose || "no info"}. Dosage guide: ${m.dosage || "no info"}. Side effects: ${m.sideEffects || "none"}. Safety precautions: ${m.precautions || "none"}.`
          ).join(" ");
      }
    } else {
      if (speakLanguage === "hi") {
        rawText = `दवा का नाम ${result.medicineName || "अज्ञात"} है. यह ${displayFields.purpose || "कोई जानकारी नहीं"} के काम आती है. खुराक की जानकारी है: ${displayFields.dosage || "कोई जानकारी नहीं"}. दुष्प्रभाव हैं: ${displayFields.sideEffects || "कोई नहीं"}. सावधानियां हैं: ${displayFields.precautions || "कोई नहीं"}`;
      } else if (speakLanguage === "mr") {
        rawText = `औषधाचे नाव ${result.medicineName || "अज्ञात"} आहे. हे ${displayFields.purpose || "माहिती उपलब्ध नाही"} साठी वापरले जाते. डोस ची माहिती: ${displayFields.dosage || "माहिती उपलब्ध नाही"}. दुष्परिणाम आहेत: ${displayFields.sideEffects || "काही नाही"}. दक्षता आणि सावधानता आहे: ${displayFields.precautions || "काही नाही"}`;
      } else {
        rawText = `Medicine: ${result.medicineName || "Unknown"}. Purpose of medicine: ${displayFields.purpose || "none"}. Dosage and guidance: ${displayFields.dosage || "none"}. Common side effects: ${displayFields.sideEffects || "none"}. Safety warnings and precautions: ${displayFields.precautions || "none"}`;
      }
    }

    setSpokenText(rawText);

    // Cancel any stuck utterances and resume the queue to ensure complete speech responsiveness
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const utterance = new SpeechSynthesisUtterance(rawText);
    
    // Save reference of utterance to prevent garbage collection cut-off midway
    (window as any)._activeUtterance = utterance;

    // Choose appropriate voice language dynamically
    const voices = window.speechSynthesis.getVoices();
    let chosenVoice: SpeechSynthesisVoice | null = null;

    if (speakLanguage === "mr") {
      // 1. Try finding explicit Marathi voice
      chosenVoice = voices.find(v => v.lang.toLowerCase().startsWith("mr") || v.lang.toLowerCase().includes("mr")) || null;
      
      // 2. Playback fallback: use Hindi voiced parser since both Hindi & Marathi are in Devanagari script
      if (!chosenVoice) {
        console.log("No indigenous Marathi voice engine detected. Routing text to Devanagari Hindi TTS.");
        chosenVoice = voices.find(v => v.lang.toLowerCase().startsWith("hi") || v.lang.toLowerCase().includes("hi")) || null;
      }
    } else if (speakLanguage === "hi") {
      chosenVoice = voices.find(v => v.lang.toLowerCase().startsWith("hi") || v.lang.toLowerCase().includes("hi")) || null;
    } else {
      chosenVoice = voices.find(v => v.lang.toLowerCase().startsWith("en") || v.lang.toLowerCase().includes("en")) || null;
    }

    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang;
    } else {
      // Default fallback settings
      if (speakLanguage === "hi") {
        utterance.lang = "hi-IN";
      } else if (speakLanguage === "mr") {
        utterance.lang = "mr-IN";
      } else {
        utterance.lang = "en-US";
      }
    }

    // Adjust rate for clear comprehension
    utterance.rate = 0.85;

    utterance.onstart = () => {
      setSpeechActive(true);
    };

    utterance.onend = () => {
      setSpeechActive(false);
    };

    utterance.onerror = (e) => {
      console.error("SpeechSynthesis error:", e);
      setSpeechActive(false);
    };

    // Trigger standard speechSynthesis Speak call
    window.speechSynthesis.speak(utterance);
    
    // Safety timeout in case start/end events are blocked inside sandbox environments
    // This turns off active visual animations after a reasonable speaking timeout
    setTimeout(() => {
      if (!window.speechSynthesis.speaking) {
        setSpeechActive(false);
      }
    }, 1500);
  };

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-slate-100 dark:border-zinc-900 shadow-sm p-6 animate-in fade-in" id="scan-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold font-sans text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-500" />
            Scanner & Info Engine
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload tablet strips, medication shapes, or written formulas for instant reading
          </p>
        </div>

        {/* Toggle Mode */}
        <div className="flex bg-slate-100 dark:bg-black p-0.5 rounded-lg border border-slate-200 dark:border-zinc-850">
          <button
            onClick={() => setIsPrescription(false)}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${!isPrescription ? "bg-white text-teal-800 dark:bg-zinc-900 dark:text-teal-300 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-zinc-400"}`}
          >
            Tablet Strip
          </button>
          <button
            onClick={() => setIsPrescription(true)}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${isPrescription ? "bg-white text-teal-800 dark:bg-zinc-900 dark:text-teal-300 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-zinc-400"}`}
          >
            Prescription OCR
          </button>
        </div>
      </div>

      {/* Main interaction pad */}
      {!loading && !result && (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 dark:border-zinc-800 rounded-xl py-12 px-6 flex flex-col items-center justify-center text-center cursor-pointer hover:border-teal-500 dark:hover:bg-zinc-900/10 hover:bg-teal-50/10 transition-all group"
          id="upload-pad"
        >
          <div className="w-12 h-12 bg-slate-50 dark:bg-black rounded-full flex items-center justify-center border border-slate-100 dark:border-zinc-850 text-slate-400 group-hover:scale-105 group-hover:text-teal-600 group-hover:bg-teal-50 transition-all duration-300 mb-3 shadow-inner">
            <Upload className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {isPrescription ? "Click to scan Handwritten Prescription" : "Click to Scan Medicine Tablet / Strip"}
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Supports JPG, PNG images. Make sure labels, names, or handwritings are readable in strong light.
          </p>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Loading Steps screen */}
      {loading && (
        <div className="py-12 flex flex-col items-center justify-center text-center" id="scanning-progress">
          <div className="relative w-16 h-16 mb-4">
            {/* outer loading ring */}
            <div className="absolute inset-0 rounded-full border-4 border-slate-100 dark:border-zinc-800 border-t-emerald-500 animate-spin" />
            <div className="absolute inset-2 bg-emerald-50 dark:bg-emerald-950/20 rounded-full flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-emerald-600 animate-pulse" />
            </div>
          </div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Analyzing Medication...</h4>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-mono bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1 rounded-full border border-emerald-100 dark:border-emerald-900/40 max-w-md mx-auto animate-pulse">
            {analysisStep}
          </p>
        </div>
      )}

      {/* Scan Results Display */}
      {result && (
        <div className="space-y-6 relative animate-in fade-in" id="scan-result-card">
          {translating && (
            <div className="absolute inset-0 bg-white/75 dark:bg-black/80 backdrop-blur-[2px] flex flex-col items-center justify-center rounded-xl z-20 transition-all duration-300">
              <div className="border-4 border-slate-150 dark:border-zinc-800 border-t-teal-600 rounded-full w-10 h-10 animate-spin" />
              <span className="text-xs font-bold text-teal-850 dark:text-teal-300 mt-3 animate-pulse">Translating medicine details with clinical accuracy...</span>
              <span className="text-[10px] text-slate-400 font-mono mt-1 font-medium">CONVERTING TO {speakLanguage === "hi" ? "HINDI" : "MARATHI"} SYLLABLES...</span>
            </div>
          )}

          {/* Header Card */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-100 dark:border-zinc-800">
            <div>
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-400 bg-white dark:bg-black border border-slate-100 dark:border-zinc-800 px-2 py-0.5 rounded-full inline-block">
                {isPrescription ? "Processed Prescription" : "Identified Medicine"}
              </span>
              <h3 className="text-xl font-extrabold text-slate-850 dark:text-slate-100 mt-1 flex items-center gap-2">
                {result.medicineName}
                {result.isSafe ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                )}
              </h3>
            </div>

            {/* Severity tag */}
            <div className="text-left py-1">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${
                result.severity === "safe" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900" :
                result.severity === "caution" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-450 border border-amber-100 dark:border-amber-905" :
                "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-455 border border-rose-100 dark:border-rose-905"
              }`}>
                {result.severity}
              </span>
            </div>
          </div>

          {/* Multilingual Speech Controls (India focus) */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-teal-50/40 dark:bg-zinc-900/60 rounded-xl border border-teal-100/50 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-teal-600 shrink-0" />
              <p className="text-xs text-teal-800 dark:text-teal-300 font-medium">
                Choose view & voice language:
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <select
                value={speakLanguage}
                onChange={(e) => handleLanguageChange(e.target.value as any)}
                className="text-xs bg-white dark:bg-black border border-teal-200 dark:border-zinc-800 text-teal-800 dark:text-teal-300 rounded-lg py-1 px-2.5 outline-none font-medium focus:ring-2 focus:ring-teal-100 focus:border-teal-400 cursor-pointer"
              >
                <option value="en">English (English)</option>
                <option value="hi">Hindi (हिंदी)</option>
                <option value="mr">Marathi (मराठी)</option>
              </select>

              <button
                onClick={handleSpeak}
                disabled={translating}
                className={`py-1 px-3 ${speechActive ? "bg-rose-500 hover:bg-rose-600" : "bg-teal-600 hover:bg-teal-700"} text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm disabled:opacity-50`}
              >
                {speechActive ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5 animate-bounce" />
                    Stop Voice
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    Speak aloud
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Real-time Visual Subtitles & Assistive Reader Tray */}
          {speechActive && spokenText && (
            <div className="p-4 bg-slate-900 dark:bg-black text-slate-100 rounded-xl border border-slate-850 dark:border-zinc-800 shadow-inner flex flex-col gap-2 animate-fade-in relative overflow-hidden">
              <div className="absolute top-0 right-0 p-1 bg-teal-500 text-slate-950 font-bold font-mono text-[8px] uppercase tracking-wider rounded-bl-lg flex items-center gap-1 animate-pulse">
                <span className="w-1.5 h-1.5 bg-slate-950 rounded-full animate-ping" />
                Audio Subtitles Running
              </div>
              <div className="flex items-center gap-2.5 text-xs text-teal-400 font-bold font-mono text-[10px] tracking-wider uppercase">
                <div className="flex gap-0.5 items-end h-3">
                  <span className="w-0.5 bg-teal-400 animate-pulse h-2.5" />
                  <span className="w-0.5 bg-teal-400 animate-pulse h-1.5" style={{ animationDelay: "0.2s" }} />
                  <span className="w-0.5 bg-teal-400 animate-pulse h-3" style={{ animationDelay: "0.4s" }} />
                  <span className="w-0.5 bg-teal-400 animate-pulse h-2" style={{ animationDelay: "0.1s" }} />
                </div>
                {speakLanguage === "hi" ? "त्वरित वाचन पाठ" : speakLanguage === "mr" ? "त्वरित वाचन मजकूर" : "Clinical Reader Script"}
              </div>
              <p className="text-xs text-slate-200 leading-relaxed font-sans max-h-24 overflow-y-auto pr-1">
                {spokenText}
              </p>
              <p className="text-[9px] text-slate-450 italic text-slate-400">
                {speakLanguage === "hi" ? "*अगर आपको आवाज नहीं आ रही है, तो कृपया अपने डिवाइस का वॉल्यूम बढ़ाएं या ऊपर दिए गए पाठ को पढ़ें।" : speakLanguage === "mr" ? "*जर आवाज येत नसेल, तर कृपया तुमच्या उपकरणाचा आवाज वाढवा किंवा वरील मजकूर वाचा." : "*If speech audio doesn't play directly, you can read along with the synthesized script above."}
              </p>
            </div>
          )}

          {/* Details layout */}
          {translatedMedicines && translatedMedicines.length > 0 ? (
            <div className="space-y-6">
              <div className="border-b border-dashed border-slate-100 dark:border-zinc-800 pb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase">
                  Prescription medicine cards breakdown ({translatedMedicines.length} found)
                </span>
              </div>
              
              <div className="grid grid-cols-1 gap-6">
                {translatedMedicines.map((med, index) => {
                  const medSeverity = med.severity || "safe";
                  return (
                    <div 
                      key={index} 
                      className="bg-slate-50/30 dark:bg-zinc-900/40 border border-slate-150/80 dark:border-zinc-800 rounded-2xl overflow-hidden transition-all duration-300"
                    >
                      {/* Header row of individual medicine card */}
                      <div className="bg-slate-50/70 dark:bg-zinc-900 px-5 py-3 border-b border-slate-150/70 dark:border-zinc-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5.5 h-5.5 rounded-full bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-zinc-800 text-teal-700 dark:text-teal-400 flex items-center justify-center font-bold text-xs font-mono">
                            {index + 1}
                          </span>
                          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                            {med.name}
                          </h4>
                        </div>
                        
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          medSeverity === "safe" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-800" :
                          medSeverity === "caution" ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-450 border border-amber-100 dark:border-amber-800" :
                          "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-455 border border-rose-100 dark:border-rose-800"
                        }`}>
                          {medSeverity}
                        </span>
                      </div>

                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-black p-3.5 rounded-xl border border-slate-100/50 dark:border-zinc-850">
                          <h5 className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1 flex items-center gap-1 font-mono">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                            {speakLanguage === "hi" ? "उपयोग / उद्देश्य" : speakLanguage === "mr" ? "औषध वापर / हेतू" : "Purpose"}
                          </h5>
                          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed font-sans">
                            {med.purpose}
                          </p>
                        </div>

                        <div className="bg-white dark:bg-black p-3.5 rounded-xl border border-slate-100/50 dark:border-zinc-850">
                          <h5 className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1 font-mono">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                            {speakLanguage === "hi" ? "खुराक और सलाह" : speakLanguage === "mr" ? "डोस आणि सूचना" : "Dosage & Guidance"}
                          </h5>
                          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed font-sans whitespace-pre-line">
                            {med.dosage}
                          </p>
                        </div>

                        <div className="bg-white dark:bg-black p-3.5 rounded-xl border border-slate-100/50 dark:border-zinc-850">
                          <h5 className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1 flex items-center gap-1 font-mono">
                            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                            {speakLanguage === "hi" ? "दुष्प्रभाव / साइड इफेक्ट्स" : speakLanguage === "mr" ? "दुष्परिणाम / साईड इफेक्ट्स" : "Common Side Effects"}
                          </h5>
                          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed font-sans whitespace-pre-line">
                            {med.sideEffects}
                          </p>
                        </div>

                        <div className="bg-white dark:bg-black p-3.5 rounded-xl border border-slate-100/50 dark:border-zinc-850">
                          <h5 className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1 flex items-center gap-1 font-mono">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                            {speakLanguage === "hi" ? "सुरक्षा सावधानियां" : speakLanguage === "mr" ? "सुरक्षा आणि खबरदारी" : "Safety Warnings"}
                          </h5>
                          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed font-sans whitespace-pre-line">
                            {med.precautions}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50/50 dark:bg-zinc-900/40 p-4 rounded-xl border border-slate-100/80 dark:border-zinc-800">
                <h4 className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5 flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                  {speakLanguage === "hi" ? "उपयोग / उद्देश्य" : speakLanguage === "mr" ? "औषध वापर / हेतू" : "Purpose of Medicine"}
                </h4>
                <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed font-sans">
                  {displayFields.purpose}
                </p>
              </div>

              <div className="bg-slate-50/50 dark:bg-zinc-900/40 p-4 rounded-xl border border-slate-100/80 dark:border-zinc-800">
                <h4 className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5 flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  {speakLanguage === "hi" ? "खुराक और सलाह" : speakLanguage === "mr" ? "डोस आणि सूचना" : "Dosage & Guidance"}
                </h4>
                <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed font-sans whitespace-pre-line">
                  {displayFields.dosage}
                </p>
              </div>

              <div className="bg-slate-50/50 dark:bg-zinc-900/40 p-4 rounded-xl border border-slate-100/80 dark:border-zinc-800">
                <h4 className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5 flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                  {speakLanguage === "hi" ? "दुष्प्रभाव / साइड इफेक्ट्स" : speakLanguage === "mr" ? "दुष्परिणाम / साईड इफेक्ट्स" : "Alert Side Effects"}
                </h4>
                <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed font-sans whitespace-pre-line">
                  {displayFields.sideEffects}
                </p>
              </div>

              <div className="bg-slate-50/50 dark:bg-zinc-900/40 p-4 rounded-xl border border-slate-100/80 dark:border-zinc-800">
                <h4 className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5 flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                  {speakLanguage === "hi" ? "सुरक्षा सावधानियां" : speakLanguage === "mr" ? "सुरक्षा आणि खबरदारी" : "Safety Precautions"}
                </h4>
                <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed font-sans whitespace-pre-line">
                  {displayFields.precautions}
                </p>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 dark:border-zinc-900 flex items-center justify-between">
            <button
              onClick={() => {
                setResult(null);
                setSpeechActive(false);
                window.speechSynthesis.cancel();
                onClearResult?.();
              }}
              className="text-xs text-teal-600 dark:text-teal-455 font-semibold hover:underline bg-transparent"
            >
              Scan another medicine
            </button>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 italic flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-400" />
              Automated analysis powered by MediScan clinical AI
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-xl flex items-start gap-2.5 mt-4">
          <AlertCircle className="w-4 h-4 text-rose-550 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="text-rose-600 font-bold underline bg-transparent text-left"
            >
              Dismiss and scan again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
