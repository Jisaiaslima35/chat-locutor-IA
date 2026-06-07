import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { 
  Send, 
  Users, 
  Edit2, 
  Check, 
  X,
  Sparkles,
  MessageSquare
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ChatMessage } from "./types";

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [nickname, setNickname] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineCount, setOnlineCount] = useState(1);
  const [banned, setBanned] = useState(false);
  const [bannedReason, setBannedReason] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Connect to the shared real-time Socket.IO server
  useEffect(() => {
    const savedNick = localStorage.getItem("radio_chat_nickname") || "";

    const newSocket = io({
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    setSocket(newSocket);

    newSocket.on("connect", () => {
      setConnected(true);
      newSocket.emit("join-chat", {
        usuario: savedNick || undefined,
        isModerator: false
      });
    });

    newSocket.on("disconnect", () => {
      setConnected(false);
    });

    newSocket.on("init-messages", (history: ChatMessage[]) => {
      setMessages(history);
    });

    newSocket.on("chat-message", (msg: ChatMessage) => {
      setMessages(prev => {
        if (prev.some(p => p.id === msg.id)) return prev;
        return [...prev, msg];
      });
      
      // Sync local username once system signals the assigned/welcome name
      if (msg.usuario === "Sistema" && msg.mensagem.includes("conectado como")) {
        const parts = msg.mensagem.split("conectado como ");
        if (parts[1]) {
          const finalNick = parts[1].split(".")[0].trim();
          setNickname(finalNick);
          setNameInput(finalNick);
        }
      }
    });

    newSocket.on("message-deleted", (id: string) => {
      setMessages(prev => prev.filter(msg => msg.id !== id));
    });

    newSocket.on("system-status", (status: { onlineCount: number }) => {
      setOnlineCount(status.onlineCount);
    });

    newSocket.on("ban-status", (data: { banned: boolean; reason?: string }) => {
      if (data.banned) {
        setBanned(true);
        setBannedReason(data.reason || "Seu acesso ao bate-papo foi bloqueado.");
      }
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // Soft auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle Nickname Update
  const handleSaveNickname = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanNick = nameInput.trim();
    if (!cleanNick) return;
    
    localStorage.setItem("radio_chat_nickname", cleanNick);
    setNickname(cleanNick);
    setIsEditingName(false);

    if (socket) {
      socket.emit("join-chat", {
        usuario: cleanNick,
        isModerator: false
      });
    }
  };

  // Chat message submit handler
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMsg = inputMessage.trim();
    if (!cleanMsg) return;

    if (socket) {
      socket.emit("send-message", cleanMsg);
      setInputMessage("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-3 md:p-6 font-sans selection:bg-purple-600 selection:text-white" id="minnit-app">
      {banned ? (
        <div className="max-w-md w-full bg-slate-900 border border-red-900/40 rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden" id="ban-screen">
          <div className="mx-auto w-12 h-12 bg-red-950/80 border border-red-500/20 rounded-xl flex items-center justify-center mb-4">
            <X className="w-6 h-6 text-red-400" />
          </div>
          <h3 className="text-xl font-bold text-red-300 mb-2">Acesso Restrito</h3>
          <p className="text-slate-400 text-sm mb-6">
            {bannedReason || "Conexão suspensa pela moderação."}
          </p>
          <button 
            type="button"
            onClick={() => window.location.reload()} 
            className="w-full py-2 bg-red-600 hover:bg-red-500 text-sm font-semibold rounded-lg text-white transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      ) : (
        <main className="w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col h-[640px]" id="chat-card">
          
          {/* Minnit Styled Clean Header */}
          <header className="px-5 py-4 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between" id="chat-header">
            <div className="flex items-center space-x-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></span>
              <div>
                <h1 className="text-sm font-bold tracking-wide text-slate-100 uppercase">
                  Bate-papo da Rádio
                </h1>
                <p className="text-[10px] text-slate-400 font-medium">
                  Conexão ativa com Hermes VPS
                </p>
              </div>
            </div>

            {/* Listeners Counter Badge */}
            <div className="flex items-center space-x-1.5 bg-slate-950 px-3 py-1.5 rounded-full border border-slate-850/60 shadow-inner">
              <Users className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs font-bold text-slate-200">{onlineCount}</span>
              <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">ouvintes</span>
            </div>
          </header>

          {/* Compact Inline Identity Manager */}
          <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800/50 flex items-center justify-between text-xs" id="nickname-bar">
            {isEditingName ? (
              <form 
                onSubmit={handleSaveNickname}
                className="flex items-center space-x-2 w-full"
              >
                <span className="text-slate-500 text-[11px] shrink-0">Apelido:</span>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={18}
                  className="flex-1 bg-slate-900 border border-slate-750 focus:border-purple-500 text-xs px-2 py-1 rounded focus:outline-none text-white h-7 font-mono"
                  autoFocus
                />
                <button 
                  type="submit"
                  className="p-1 text-green-400 hover:text-green-300 bg-slate-900 rounded border border-slate-750 hover:bg-slate-800 h-7 w-7 flex items-center justify-center transition-all shrink-0"
                  title="Salvar Apelido"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setNameInput(nickname);
                    setIsEditingName(false);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-200 bg-slate-900 rounded border border-slate-750 hover:bg-slate-800 h-7 w-7 flex items-center justify-center transition-all shrink-0"
                  title="Cancelar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-between w-full text-slate-400">
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-500 text-[11px]">Seu nome:</span>
                  <strong className="text-purple-400 font-mono tracking-tight text-xs bg-purple-950/30 px-2 py-0.5 rounded border border-purple-500/10">
                    {nickname || "Gerando..."}
                  </strong>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="flex items-center space-x-1 hover:text-slate-200 px-2.5 py-1 bg-slate-950 border border-slate-850 hover:bg-slate-850 rounded text-[11px] transition-all font-medium cursor-pointer"
                >
                  <Edit2 className="w-3 h-3 text-slate-500" />
                  <span>Alterar</span>
                </button>
              </div>
            )}
          </div>

          {/* Chat Messages Feed Area */}
          <div 
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 bg-slate-950/20"
            id="chat-feed"
          >
            <AnimatePresence initial={false}>
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                  <MessageSquare className="w-8 h-8 text-slate-700 animate-pulse" />
                  <p className="text-slate-400 text-xs font-semibold">Nenhuma mensagem enviada</p>
                  <p className="text-slate-600 text-[11px] max-w-xs">
                    Envie a primeira mensagem para testar, ou digite <strong className="text-purple-400">@hermes</strong> para acionar a inteligência artificial!
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isHermes = msg.tipo === "hermes" || msg.usuario.includes("Hermes");
                  const isSystem = msg.tipo === "sistema" || msg.usuario === "Sistema";

                  // Layout definitions
                  let bubbleBg = "bg-slate-800 text-slate-100 border-slate-750";
                  let authorColor = "text-purple-400";
                  let messageStyle = "text-[13px] leading-relaxed break-words text-slate-200";

                  if (isHermes) {
                    bubbleBg = "bg-purple-950/40 border-purple-500/20 text-purple-100 shadow-[0_2px_12px_rgba(168,85,247,0.03)]";
                    authorColor = "text-purple-400 font-bold flex items-center gap-1";
                  } else if (isSystem) {
                    bubbleBg = "bg-slate-950/50 border-slate-850 text-slate-400";
                    authorColor = "text-slate-500 font-medium";
                    messageStyle = "text-xs italic text-slate-400";
                  } else {
                    // Regular user message: look clean
                    bubbleBg = "bg-slate-850/80 border-slate-800 text-slate-100";
                    authorColor = "text-blue-400";
                  }

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-start"
                    >
                      <div className={`p-3 rounded-xl border w-full text-left ${bubbleBg} shadow-sm transition-all`}>
                        {/* Meta Header block inside bubble */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`${authorColor} text-[11px] font-bold tracking-wide font-mono`}>
                            {isHermes ? (
                              <>
                                <Sparkles className="w-3 h-3 text-purple-400 inline" /> {msg.usuario}
                              </>
                            ) : msg.usuario}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">
                            {new Date(msg.datahora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Text message */}
                        <p className={messageStyle}>
                          {msg.mensagem}
                        </p>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          {/* Under-Chat Help Strip */}
          <div className="px-5 py-2 bg-slate-950/50 border-t border-slate-850 flex items-center justify-between text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              💡 Use <strong className="text-purple-400">@hermes</strong> para chamar a IA
            </span>
            {connected && (
              <span className="font-medium text-emerald-500/80 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping"></span>
                Socket.IO Ativo
              </span>
            )}
          </div>

          {/* Lower Input Delivery Box Form */}
          <form 
            onSubmit={handleSendMessage} 
            className="p-4 bg-slate-950/70 border-t border-slate-800 flex gap-2"
            id="chat-input-form"
          >
            <input
              type="text"
              placeholder="Digite sua mensagem na rádio..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 hover:border-slate-750 focus:border-purple-500 text-sm text-slate-200 rounded-xl px-4 py-3 focus:outline-none transition-colors"
              id="message-text-field"
            />
            <button 
              type="submit"
              className="px-5 bg-purple-600 hover:bg-purple-500 active:scale-95 text-xs font-bold rounded-xl text-white transition-all flex items-center justify-center space-x-1.5 shadow-md shadow-purple-600/10 cursor-pointer"
              id="send-msg-btn"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Enviar</span>
            </button>
          </form>

        </main>
      )}
    </div>
  );
}
