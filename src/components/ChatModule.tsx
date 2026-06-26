import React, { useState, useRef, useEffect } from "react";
import { Send, Sparkles, MessageSquare, RefreshCw, Plus, Trash2, Menu, X, Clock } from "lucide-react";
import { ChatMessage } from "../types";

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  lastUpdatedAt: string;
}

export default function ChatModule({ userId }: { userId: string }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [inputMsg, setInputMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize and load sessions from localStorage on mount or userId change
  useEffect(() => {
    const storageKey = `mediscan_chats_${userId}`;
    const saved = localStorage.getItem(storageKey);
    let sessionList: ChatSession[] = [];
    if (saved) {
      try {
        sessionList = JSON.parse(saved);
      } catch (err) {
        console.error("Failed to parse chat sessions:", err);
      }
    }

    if (sessionList.length === 0) {
      const defaultSession: ChatSession = {
        id: "session_welcome",
        title: "Pharmacist Chat",
        messages: [
          {
            id: "welcome",
            role: "model",
            content: "Hello! I am your MediScan Pharmacist Assistant. You can ask me follow-up questions about tablet usage, interactions, side-effects, or food precautions. How can I help you support your wellness journey today?",
            timestamp: new Date().toISOString()
          }
        ],
        lastUpdatedAt: new Date().toISOString()
      };
      sessionList = [defaultSession];
      localStorage.setItem(storageKey, JSON.stringify(sessionList));
    }

    setSessions(sessionList);
    setActiveSessionId(sessionList[0].id);
  }, [userId]);

  const currentSession = sessions.find(s => s.id === activeSessionId) || sessions[0];
  const messages = currentSession ? currentSession.messages : [];

  // Auto-scroll logic as dialogues expand
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: "session_" + Date.now(),
      title: "New Chat",
      messages: [
        {
          id: "welcome_" + Date.now(),
          role: "model",
          content: "Hello! I am your MediScan Pharmacist Assistant. What questions can I answer about medication directions, side-effects, dosage schedules, or warnings today?",
          timestamp: new Date().toISOString()
        }
      ],
      lastUpdatedAt: new Date().toISOString()
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    setActiveSessionId(newSession.id);
    localStorage.setItem(`mediscan_chats_${userId}`, JSON.stringify(updated));
    setShowSidebar(false);
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    setShowSidebar(false);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid selecting the chat session being deleted
    const updated = sessions.filter(s => s.id !== id);
    if (updated.length === 0) {
      // If none left, create a fresh welcome session
      const defaultSession: ChatSession = {
        id: "session_welcome_" + Date.now(),
        title: "Pharmacist Chat",
        messages: [
          {
            id: "welcome",
            role: "model",
            content: "Hello! I am your MediScan Pharmacist Assistant. You can ask me follow-up questions about tablet usage, interactions, side-effects, or food precautions. How can I help you support your wellness journey today?",
            timestamp: new Date().toISOString()
          }
        ],
        lastUpdatedAt: new Date().toISOString()
      };
      const finalSessions = [defaultSession];
      setSessions(finalSessions);
      setActiveSessionId(defaultSession.id);
      localStorage.setItem(`mediscan_chats_${userId}`, JSON.stringify(finalSessions));
    } else {
      setSessions(updated);
      localStorage.setItem(`mediscan_chats_${userId}`, JSON.stringify(updated));
      // If we deleted the active one, shift active to the first remaining session
      if (activeSessionId === id) {
        setActiveSessionId(updated[0].id);
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMsg = inputMsg.trim();
    if (!cleanMsg || loading || !currentSession) return;

    const userMessage: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      role: "user",
      content: cleanMsg,
      timestamp: new Date().toISOString()
    };

    // Build the updated messages list
    const updatedMessages = [...currentSession.messages, userMessage];

    // Auto-update title if it's the initial default title
    let newTitle = currentSession.title;
    if (currentSession.title === "New Chat" || currentSession.title === "Pharmacist Chat") {
      newTitle = cleanMsg.length > 25 ? cleanMsg.substring(0, 25) + "..." : cleanMsg;
    }

    // Update active session in state
    const updatedSessions = sessions.map(s => {
      if (s.id === currentSession.id) {
        return {
          ...s,
          title: newTitle,
          messages: updatedMessages,
          lastUpdatedAt: new Date().toISOString()
        };
      }
      return s;
    });

    setSessions(updatedSessions);
    localStorage.setItem(`mediscan_chats_${userId}`, JSON.stringify(updatedSessions));
    setInputMsg("");
    setLoading(true);

    try {
      // Send complete chat history sequence to prompt conversational continuity
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      if (!response.ok) {
        throw new Error("Failed to consult MediScan AI chatbot.");
      }

      const resData = await response.json();
      const modelMessage: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: "model",
        content: resData.reply,
        timestamp: new Date().toISOString()
      };

      const finalMessages = [...updatedMessages, modelMessage];
      const finalSessions = updatedSessions.map(s => {
        if (s.id === currentSession.id) {
          return {
            ...s,
            messages: finalMessages,
            lastUpdatedAt: new Date().toISOString()
          };
        }
        return s;
      });

      setSessions(finalSessions);
      localStorage.setItem(`mediscan_chats_${userId}`, JSON.stringify(finalSessions));
    } catch (err) {
      console.error(err);
      const errorMessage: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: "model",
        content: "I'm having trouble connecting to my knowledge base right now. Please ensure your internet connection is active and ask again.",
        timestamp: new Date().toISOString()
      };

      const finalMessages = [...updatedMessages, errorMessage];
      const finalSessions = updatedSessions.map(s => {
        if (s.id === currentSession.id) {
          return {
            ...s,
            messages: finalMessages,
            lastUpdatedAt: new Date().toISOString()
          };
        }
        return s;
      });

      setSessions(finalSessions);
      localStorage.setItem(`mediscan_chats_${userId}`, JSON.stringify(finalSessions));
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = () => {
    if (!currentSession) return;
    const clearedMessages: ChatMessage[] = [
      {
        id: "welcome_" + Date.now(),
        role: "model",
        content: "Resetting pharmacist session! What questions can I answer about medication directions, side-effects, dosage schedules, or warnings today?",
        timestamp: new Date().toISOString()
      }
    ];

    const updatedSessions = sessions.map(s => {
      if (s.id === currentSession.id) {
        return {
          ...s,
          title: "New Chat",
          messages: clearedMessages,
          lastUpdatedAt: new Date().toISOString()
        };
      }
      return s;
    });

    setSessions(updatedSessions);
    localStorage.setItem(`mediscan_chats_${userId}`, JSON.stringify(updatedSessions));
  };

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-slate-100 dark:border-zinc-900 shadow-sm flex flex-col md:flex-row h-[580px] overflow-hidden relative" id="chat-stage-container">
      {/* Backdrop for Mobile Sidebar overlay */}
      {showSidebar && (
        <div 
          className="absolute inset-0 z-20 bg-slate-900/40 dark:bg-black/60 md:hidden animate-in fade-in duration-200" 
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* LEFT SIDEBAR: Chat History */}
      <div className={`absolute md:relative inset-y-0 left-0 z-30 w-64 border-r border-slate-100 dark:border-zinc-900 bg-slate-50/50 dark:bg-zinc-950 flex flex-col h-full transform ${
        showSidebar ? "translate-x-0" : "-translate-x-full"
      } md:translate-x-0 transition-transform duration-200 ease-in-out`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-100 dark:border-zinc-900 flex items-center justify-between bg-white/60 dark:bg-zinc-950">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 font-mono flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-teal-650" />
            Chat History
          </span>
          
          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            className="p-1.5 bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-zinc-800 hover:border-teal-200 hover:bg-teal-100/40 text-teal-700 dark:text-teal-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
            title="Start New Chat Session"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
        </div>

        {/* Sidebar Scrollable Sessions List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {sessions.map((s) => {
            const isActive = s.id === activeSessionId;
            const lastMsg = s.messages[s.messages.length - 1];
            return (
              <div
                key={s.id}
                onClick={() => handleSelectSession(s.id)}
                className={`p-3 rounded-xl border transition-all duration-150 text-left cursor-pointer flex items-center justify-between gap-2.5 group relative ${
                  isActive
                    ? "bg-teal-50/70 dark:bg-teal-950/20 border-teal-100 dark:border-teal-900 text-teal-950 dark:text-teal-100"
                    : "bg-white/40 dark:bg-zinc-900/10 border-slate-100 dark:border-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-900 text-slate-700 dark:text-slate-300"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${
                      isActive ? "text-teal-600 dark:text-teal-400" : "text-slate-400 dark:text-zinc-500"
                    }`} />
                    <p className={`text-xs font-bold truncate font-sans ${
                      isActive ? "text-teal-900 dark:text-teal-300" : "text-slate-700 dark:text-slate-300 group-hover:text-teal-600 dark:group-hover:text-teal-400"
                    }`}>
                      {s.title}
                    </p>
                  </div>
                  {lastMsg && (
                    <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate mt-1 font-sans">
                      {lastMsg.content}
                    </p>
                  )}
                </div>

                {/* Delete Button */}
                <button
                  type="button"
                  onClick={(e) => handleDeleteSession(s.id, e)}
                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded transition-colors bg-transparent border-none outline-none cursor-pointer"
                  title="Delete Session"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT CHAT AREA */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-white dark:bg-zinc-950">
        {/* Module Header */}
        <div className="p-4 border-b border-slate-100 dark:border-zinc-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Toggle Sidebar Trigger for Mobile */}
            <button
              onClick={() => setShowSidebar(true)}
              className="md:hidden p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 bg-transparent cursor-pointer flex items-center justify-center"
              title="View Chat History"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-sm md:text-base font-bold font-sans text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                <MessageSquare className="w-5 h-5 text-emerald-500 animate-pulse" />
                AI Rx Chatbot
                {currentSession && (
                  <span className="hidden sm:inline-block text-[10px] font-mono bg-teal-50 dark:bg-teal-950/20 text-teal-700 dark:text-teal-400 border border-teal-100 dark:border-teal-900 px-2 py-0.5 rounded-md font-semibold">
                    {currentSession.title}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Empathetic, automated healthcare assistance & compound queries
              </p>
            </div>
          </div>

          <button
            onClick={handleClearHistory}
            className="p-1 px-2 border border-slate-205 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all active:scale-95 bg-transparent cursor-pointer"
            title="Clear Conversation History"
          >
            <RefreshCw className="w-3 h-3" />
            Clear
          </button>
        </div>

        {/* Dialogue Stream */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/30 dark:bg-zinc-900/10">
          {messages.map((m) => (
            <div 
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[80%] rounded-2xl p-3.5 text-xs inline-block leading-relaxed outline-none transition-all shadow-sm ${
                m.role === "user"
                  ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-tr-none"
                  : "bg-white dark:bg-black border border-slate-100 dark:border-zinc-900 text-slate-705 dark:text-zinc-300 rounded-tl-none"
              }`}>
                {/* Bot Avatar */}
                {m.role === "model" && (
                  <div className="flex items-center gap-1 text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-widest mb-1.5 font-sans">
                    <Sparkles className="w-3 h-3 text-emerald-500 animate-pulse" />
                    MediScan Expert Coach
                  </div>
                )}
                <p className="whitespace-pre-wrap font-sans font-medium">{m.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-black border border-slate-100 dark:border-zinc-900 rounded-2xl rounded-tl-none p-3 shadow-sm inline-flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce delay-75" />
                <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce delay-150" />
                <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce delay-300" />
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-semibold font-mono ml-1">Drafting Rx response...</span>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* Input Tray */}
        <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-100 dark:border-zinc-900 bg-white dark:bg-zinc-950 flex gap-2">
          <input
            type="text"
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            placeholder="Ask about dosage, empty stomach rules, side effects, etc..."
            className="flex-1 px-4 py-2.5 rounded-xl text-xs border border-slate-205 dark:border-zinc-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-100 dark:focus:ring-teal-900/30 transition-all outline-none text-slate-700 dark:text-zinc-100 bg-slate-50/50 dark:bg-black font-sans"
          />
          <button
            type="submit"
            disabled={!inputMsg.trim() || loading}
            className="p-2.5 px-4 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-xl active:scale-95 transition-all shadow-sm shadow-emerald-50 hover:opacity-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer border-none"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
