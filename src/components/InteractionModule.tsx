import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Trash2, 
  AlertTriangle, 
  CheckCircle, 
  HelpCircle, 
  Shuffle, 
  Sparkles,
  ShieldAlert,
  AlertCircle,
  Info,
  Volume2,
  VolumeX
} from "lucide-react";
import { DrugInteractionResult } from "../types";

export default function InteractionModule() {
  const [meds, setMeds] = useState<string[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<DrugInteractionResult | null>(null);

  // Translation & Speech states
  const [speakLanguage, setSpeakLanguage] = useState<"en" | "hi" | "mr">("en");
  const [speechActive, setSpeechActive] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [spokenText, setSpokenText] = useState("");
  const [displayExplanation, setDisplayExplanation] = useState("");

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleAddMed = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanMed = currentInput.trim();
    if (!cleanMed) return;

    if (meds.some(m => m.toLowerCase() === cleanMed.toLowerCase())) {
      setErrorMsg("This medicine is already in the check list.");
      return;
    }

    setMeds([...meds, cleanMed]);
    setCurrentInput("");
  };

  const handleRemoveMed = (index: number) => {
    setMeds(meds.filter((_, i) => i !== index));
    setResult(null); // Clear previous results as the set changed
    setSpeechActive(false);
    setSpeakLanguage("en");
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  // Live on-the-fly translation for drug interactions report
  const handleLanguageChange = async (newLang: "en" | "hi" | "mr") => {
    setSpeakLanguage(newLang);
    if (!result) return;

    if (speechActive) {
      window.speechSynthesis.cancel();
      setSpeechActive(false);
    }

    if (newLang === "en") {
      setDisplayExplanation(result.explanation || "");
      return;
    }

    setTranslating(true);
    try {
      const response = await fetch("/api/translate-interaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          explanation: result.explanation,
          targetLang: newLang
        })
      });

      if (!response.ok) {
        throw new Error("Translation failed");
      }

      const translatedData = await response.json();
      setDisplayExplanation(translatedData.explanation || "");
    } catch (err) {
      console.error("Live interaction translation error:", err);
    } finally {
      setTranslating(false);
    }
  };

  // Speaks interaction details aloud
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

    let severityHeader = "";
    if (speakLanguage === "hi") {
      severityHeader = `दावाओं के संयोजन की गंभीरता है: ${
        result.severity === "safe" ? "सुरक्षित" : result.severity === "caution" ? "सावधानी" : "खतरनाक"
      }। `;
    } else if (speakLanguage === "mr") {
      severityHeader = `औषाधांच्या संयोजनाची तीव्रता आहे: ${
        result.severity === "safe" ? "सुरक्षित" : result.severity === "caution" ? "सावधानता" : "धोकादायक"
      }। `;
    } else {
      severityHeader = `Medication combination warning level: ${result.severity}. `;
    }

    const narrationText = severityHeader + (displayExplanation || result.explanation);
    setSpokenText(narrationText);

    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const utterance = new SpeechSynthesisUtterance(narrationText);
    (window as any)._activeUtterance = utterance;

    const voices = window.speechSynthesis.getVoices();
    let chosenVoice: SpeechSynthesisVoice | null = null;

    if (speakLanguage === "mr") {
      chosenVoice = voices.find(v => v.lang.toLowerCase().startsWith("mr") || v.lang.toLowerCase().includes("mr")) || null;
      if (!chosenVoice) {
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
      if (speakLanguage === "hi") {
        utterance.lang = "hi-IN";
      } else if (speakLanguage === "mr") {
        utterance.lang = "mr-IN";
      } else {
        utterance.lang = "en-US";
      }
    }

    utterance.rate = 0.85;

    utterance.onstart = () => {
      setSpeechActive(true);
    };

    utterance.onend = () => {
      setSpeechActive(false);
    };

    utterance.onerror = (e) => {
      console.error("Interaction speech synthesis error:", e);
      setSpeechActive(false);
    };

    window.speechSynthesis.speak(utterance);

    setTimeout(() => {
      if (!window.speechSynthesis.speaking) {
        setSpeechActive(false);
      }
    }, 15000);
  };

  const handleCheckInteractions = async () => {
    if (meds.length < 2) {
      setErrorMsg("Please add at least 2 medications to check for safety synergies.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const response = await fetch("/api/check-interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicines: meds })
      });

      if (!response.ok) {
        const errorDetail = await response.json().catch(() => ({}));
        throw new Error(errorDetail.error || "Failed to analyze drug combinations.");
      }

      const resJson: DrugInteractionResult = await response.json();
      setResult(resJson);
      setDisplayExplanation(resJson.explanation || "");
      setSpeakLanguage("en");
      setSpeechActive(false);
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An error occurred checking medication interactions.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in" id="interactions-container">
      {/* input column */}
      <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-slate-100 dark:border-zinc-900 shadow-sm p-6 lg:col-span-1 h-fit">
        <h3 className="text-base font-bold font-sans text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-2">
          <ShieldAlert className="w-5 h-5 text-emerald-500 animate-pulse" />
          Medication Combiner
        </h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mb-5">
          Verify safety interactions before combining multiple pills or prescription items at once
        </p>

        {/* Beautiful overlap-free embedded button form layout */}
        <form onSubmit={handleAddMed} className="relative w-full">
          <input
            type="text"
            required
            placeholder="Type medicine name to add..."
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            className="w-full h-10 pl-3 pr-11 py-2 rounded-xl text-xs border border-slate-200 dark:border-zinc-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-100 transition-all outline-none text-slate-700 dark:text-zinc-100 bg-slate-50/50 dark:bg-black"
          />
          <button
            type="submit"
            className="absolute right-1 top-1 bottom-1 w-8 h-8 flex items-center justify-center bg-gradient-to-r from-teal-600 to-emerald-600 hover:opacity-95 text-white rounded-lg active:scale-95 transition-all outline-none shadow-sm cursor-pointer"
            title="Add medicine"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>

        {/* List of currently chosen items */}
        <div className="mt-5 space-y-2">
          <h4 className="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Medicines Checked</h4>
          {meds.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-zinc-500 italic pb-1">No medicines added yet.</p>
          ) : (
            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
              {meds.map((med, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-black rounded-xl border border-slate-100 dark:border-zinc-850 text-xs text-slate-700 dark:text-zinc-300 hover:bg-slate-100/50 dark:hover:bg-zinc-900/40 transition-colors"
                >
                  <span className="font-semibold">{med}</span>
                  <button
                    onClick={() => handleRemoveMed(idx)}
                    className="text-slate-400 dark:text-zinc-500 hover:text-rose-500 dark:hover:text-rose-450 transition-all outline-none cursor-pointer"
                    title="Remove medicine"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-1.5 leading-relaxed">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {meds.length >= 2 && (
          <button
            onClick={handleCheckInteractions}
            disabled={loading}
            className="mt-5 w-full py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600/90 text-white font-semibold text-xs rounded-xl hover:opacity-95 transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-1.5 disabled:opacity-75 cursor-pointer"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Cross-matching clinical database...
              </>
            ) : (
              <>
                <Shuffle className="w-4 h-4" />
                Check Interactions
              </>
            )}
          </button>
        )}
      </div>

      {/* Result Display container */}
      <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-slate-100 dark:border-zinc-900 shadow-sm p-6 lg:col-span-2">
        <h3 className="text-base font-bold font-sans text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
          <HelpCircle className="w-5 h-5 text-indigo-500" />
          Safety Assessment Diagnostic
        </h3>

        {loading ? (
          <div className="py-24 text-center">
            <div className="inline-block relative w-12 h-12 mb-3">
              <div className="absolute inset-x-0 inset-y-0 rounded-full border-2 border-slate-100 dark:border-zinc-800 border-t-teal-650 animate-spin" />
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium font-sans">
              Consulting Gemini Pharma Brain & comparing molecular formulas...
            </p>
          </div>
        ) : result ? (
          <div className="space-y-5" id="interaction-results">
            {/* Severity Header banner */}
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${
              result.severity === "safe" ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100/60 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300" :
              result.severity === "caution" ? "bg-amber-50 dark:bg-amber-950/20 border-amber-100/60 dark:border-amber-900/50 text-amber-800 dark:text-amber-305" :
              "bg-rose-50 dark:bg-rose-950/20 border-rose-100/60 dark:border-rose-900/50 text-rose-800 dark:text-rose-300"
            }`}>
              <div className="shrink-0 mt-0.5">
                {result.severity === "safe" ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600 animate-pulse" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 animate-pulse" />
                )}
              </div>
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider">
                  Combination Severity: <span className="underline">{result.severity}</span>
                </h4>
                <p className="text-xs mt-1 leading-relaxed opacity-90">
                  {result.severity === "safe" && "No generic warnings or severe dangerous interactions registered between these pharmaceutical molecules. Safe to combine under average standard instructions."}
                  {result.severity === "caution" && "Moderate interaction risk exists. We recommend spacing the times you ingest these medications or checking with a local clinic."}
                  {result.severity === "dangerous" && "WARNING: Significant potential adverse reactions identified. Avoid using these together without explicit guidance from your professional healthcare provider."}
                </p>
              </div>
            </div>

            {/* Multilingual Speech Controls (India focus) */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-teal-50/40 dark:bg-zinc-900/60 rounded-xl border border-teal-100/50 dark:border-zinc-800 font-sans mt-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                <p className="text-xs text-teal-850 dark:text-teal-300 font-medium">
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
                  className={`py-1 px-3 ${speechActive ? "bg-rose-500 hover:bg-rose-600" : "bg-teal-600 hover:bg-teal-700"} text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm disabled:opacity-50 cursor-pointer`}
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
              <div className="p-4 bg-slate-900 dark:bg-black text-slate-100 rounded-xl border border-slate-800 dark:border-zinc-805 shadow-inner flex flex-col gap-2 animate-fade-in relative overflow-hidden">
                <div className="absolute top-0 right-0 p-1 bg-teal-500 text-slate-950 font-bold font-mono text-[8px] uppercase tracking-wider rounded-bl-lg flex items-center gap-1 animate-pulse">
                  <span className="w-1.5 h-1.5 bg-slate-950 rounded-full animate-ping" />
                  Audio Subtitles Running
                </div>
                <div className="flex items-center gap-2.5 text-xs text-teal-400 font-bold font-mono text-[10px] tracking-wider uppercase">
                  <div className="flex gap-0.5 items-end h-3">
                    <span className="w-0.5 bg-teal-400 animate-pulse h-2.5" />
                    <span className="w-0.5 bg-teal-405 animate-pulse h-1.5" style={{ animationDelay: "0.2s" }} />
                    <span className="w-0.5 bg-teal-400 animate-pulse h-3" style={{ animationDelay: "0.4s" }} />
                    <span className="w-0.5 bg-teal-400 animate-pulse h-2" style={{ animationDelay: "0.1s" }} />
                  </div>
                  {speakLanguage === "hi" ? "त्वरित वाचन पाठ" : speakLanguage === "mr" ? "त्वरित वाचन मजकूर" : "Clinical Reader Script"}
                </div>
                <p className="text-xs text-slate-200 leading-relaxed font-sans max-h-24 overflow-y-auto pr-1">
                  {spokenText}
                </p>
                <p className="text-[9px] text-slate-400 dark:text-zinc-500 italic">
                  {speakLanguage === "hi" ? "*अगर आपको आवाज नहीं आ रही है, तो कृपया अपने डिवाइस का वॉल्यूम बढ़ाएं या ऊपर दिए गए पाठ को पढ़ें।" : speakLanguage === "mr" ? "*जर आवाज येत नसेल, तर कृपया तुमच्या उपकरणाचा आवाज वाढवा किंवा वरील मजकूर वाचा." : "*If speech audio doesn't play directly, you can read along with the synthesized script above."}
                </p>
              </div>
            )}

            {/* Structured Explanation block */}
            <div className="bg-slate-50 dark:bg-zinc-900/40 p-5 rounded-2xl border border-slate-100 dark:border-zinc-850 relative min-h-[100px]">
              {translating && (
                <div className="absolute inset-0 bg-white/70 dark:bg-black/80 flex flex-col items-center justify-center rounded-2xl gap-2">
                  <div className="w-5 h-5 border-2 border-teal-500 border-t-white rounded-full animate-spin" />
                  <span className="text-[10px] text-teal-800 dark:text-teal-300 font-semibold font-mono uppercase tracking-wider">Translating Diagnostic Report...</span>
                </div>
              )}
              <h4 className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1 font-sans">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                {speakLanguage === "hi" ? "दवा परस्पर क्रिया रिपोर्ट" : speakLanguage === "mr" ? "औषध परस्पर संबंध अहवाल" : "Dose Interaction Report"}
              </h4>
              <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line font-sans">
                {displayExplanation || result.explanation}
              </p>
            </div>

            {/* Disclaimer notice */}
            <p className="text-[10px] text-slate-400 dark:text-zinc-500 italic">
              {speakLanguage === "hi" 
                ? "*अस्वीकरण: यह सुरक्षा नैदानिक सहायता क्लिनिकल संदर्भ संदर्भों का उपयोग करके तैयार की गई है। हमेशा अपने चिकित्सक के साथ अंतिम खुराक की समीक्षा करें।" 
                : speakLanguage === "mr" 
                ? "*अस्वीकरण: हे सुरक्षा निदान सहाय्य क्लिनिकल संदर्भ मॉडेल वापरून व्युत्पन्न केले गेले आहे. तुमच्या डॉक्टरांबरोबर नेहमी अंतिम डोसचे पुनरावलोकन करा." 
                : "*Disclaimer: This safety diagnostics aid is generated using clinical reference models. Always review final dosages with your physician."
              }
            </p>
          </div>
        ) : (
          <div className="py-20 text-center border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center">
            <Shuffle className="w-10 h-10 text-slate-350 dark:text-zinc-650 mb-3 animate-pulse" />
            <h4 className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Ready for combo match check</h4>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-xs mx-auto">
              Add multiple tablet names (e.g. Advil + Aspirin) to the compiler list to trigger real-time AI drug safety diagnostic checks.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
