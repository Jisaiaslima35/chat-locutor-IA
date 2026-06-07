import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { 
  Send, 
  Users, 
  Edit2, 
  Check, 
  X,
  Sparkles,
  MessageSquare,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Radio,
  Tv,
  Calendar,
  Flame,
  BookOpen,
  Heart,
  Share2,
  ExternalLink,
  Clock,
  Phone,
  Video,
  Award,
  Music,
  MapPin,
  ChevronRight,
  Plus,
  Compass,
  MessageCircle,
  ThumbsUp,
  User,
  Coffee,
  Sun,
  ShieldCheck,
  Megaphone
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ChatMessage } from "./types";

// Dynamic mockup data fully designed for "Louvor que Transforma"
const LOCUTORES = [
  {
    id: 1,
    nome: "Pastor Isaías Lima",
    programa: "Clamor da Fé & Clamor da Vitória",
    horario: "Segunda a Sexta • 08:00 às 10:00",
    foto: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&h=300&q=80",
    descricao: "Mensagens de despertamento espiritual, clamores de restauração e louvores clássicos que tocam a alma."
  },
  {
    id: 2,
    nome: "Missionária Maria Souza",
    programa: "Momento de Oração e Milagres",
    horario: "Segunda a Sexta • 14:00 às 16:00",
    foto: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&h=300&q=80",
    descricao: "Correntes de cura para os enfermos, intercessão por lares destruídos e pregações impactantes baseadas na santa Bíblia."
  },
  {
    id: 3,
    nome: "Pastor Marcos Santos",
    programa: "Voz da Esperança",
    horario: "Sábado e Domingo • 19:00 às 21:00",
    foto: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=300&h=300&q=80",
    descricao: "Pregações para a família, comunhão, reflexões de esperança para começar a semana sob a bênção divina."
  },
  {
    id: 4,
    nome: "Cantora Katia Ferreira",
    programa: "Louvor que Alimenta a Alma",
    horario: "Sábado • 15:00 às 17:00",
    foto: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&h=300&q=80",
    descricao: "Lançamentos e novidades da música gospel nacional e internacional de adoração extrema."
  }
];

const VIDEOS = [
  {
    id: 1,
    titulo: "Hinos de Oração e Libertação — Harpa Cristã Instrumental",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ", // Safe placeholder, can overlay custom player inside app
    thumb: "https://images.unsplash.com/photo-1447069387593-a5de0862481e?auto=format&fit=crop&w=500&h=280&q=80",
    duracao: "1h 22min",
    visualizacoes: "62k visualizações"
  },
  {
    id: 2,
    titulo: "Testemunho Real de Cura Divina e Libertação Familiar",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    thumb: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=500&h=280&q=80",
    duracao: "45min",
    visualizacoes: "18k visualizações"
  },
  {
    id: 3,
    titulo: "Seminário de Fé & Milagres na Palavra — Pastor Isaías Lima",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    thumb: "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?auto=format&fit=crop&w=500&h=280&q=80",
    duracao: "32min",
    visualizacoes: "11k visualizações"
  }
];

const POSTS = [
  {
    id: 1,
    titulo: "Testemunho de Libertação Familiar: 'A bebida havia destruído meu lar, mas Jesus restaurou tudo!'",
    categoria: "Testemunho",
    data: "Hoje",
    resumo: "Compartilhamos a maravilhosa história do casal Roberto e Clara, que encontraram no evangelho a restauração total do seu casamento e de suas vidas após escutarem as orações da madrugada.",
    curtidas: 142
  },
  {
    id: 2,
    titulo: "O Poder Invisível da Oração Sincera: Um guia para fortalecer sua vida de comunhão diária",
    categoria: "Mensagem de Fé",
    data: "Ontem",
    resumo: "Às vezes nos sentimos cansados de clamar, mas a Bíblia ensina que o silêncio de Deus é também resposta. Veja como persistir em oração em meio aos desertos espirituais mais profundos.",
    curtidas: 98
  },
  {
    id: 3,
    titulo: "Grande Campanha '7 Voltas da Muralha da Vitória' começa nesta segunda-feira!",
    categoria: "Comunicado",
    data: "05 Jun",
    resumo: "Una-se a toda a nossa audiência nacional nesta corrente de jejum e milagres. Envie seu pedido de oração e participe ativamente via chat nos horários de clamores às 08h e 14h.",
    curtidas: 210
  }
];

const BIBLICAL_VERSES = [
  { texto: "Não fui eu que ordenei a você? Seja forte e corajoso! Não se apavore nem desanime, pois o Senhor, o seu Deus, estará com você por onde você andar.", referencia: "Josué 1:9" },
  { texto: "O Senhor é o meu pastor; de nada terei falta. Em verdes pastagens me faz repousar e me conduz a águas tranquilas.", referencia: "Salmo 23:1-2" },
  { texto: "Posso todas as coisas naquele que me fortalece.", referencia: "Filipenses 4:13" },
  { texto: "Mil poderão cair ao seu lado e dez mil à sua direita, mas você não será atingido.", referencia: "Salmo 91:7" },
  { texto: "Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.", referencia: "Salmo 37:5" }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<"principal" | "locutores" | "videos" | "posts" | "sala">("principal");

  // Web Radio Audio Stream state
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Chat Hermes connection and state
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

  // Prayer Wall (Mural de Oração)
  const [prayerRequests, setPrayerRequests] = useState<{ id: string; nome: string; pedido: string; data: string; curtidas: number }[]>([]);
  const [newPrayerName, setNewPrayerName] = useState("");
  const [newPrayerText, setNewPrayerText] = useState("");
  const [prayerSuccess, setPrayerSuccess] = useState(false);

  // Daily verse picker
  const [currentVerseIndex, setCurrentVerseIndex] = useState(0);

  // Initialize Christian radio audio stream
  useEffect(() => {
    // Initialise audio stream
    const audio = new Audio("https://stream.zeno.fm/2lakgfphuy7tv");
    audio.preload = "none";
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  // Update audio controls dynamically safely
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // Re-load the stream to bypass buffering cache latency and jump to live broadcast
      audioRef.current.src = "https://stream.zeno.fm/2lakgfphuy7tv";
      audioRef.current.load();
      audioRef.current.play().catch(err => console.log("Stream play error:", err));
      setIsPlaying(true);
    }
  };

  // Socket setup (Intact Hermes connections)
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

    // Load custom prayers from local storage
    const savedPrayers = localStorage.getItem("radio_prayers");
    if (savedPrayers) {
      setPrayerRequests(JSON.parse(savedPrayers));
    } else {
      const defaultRequests = [
        { id: "p1", nome: "Marta de Oliveira", pedido: "Peço orações pela saúde física da minha mãe Candida de 83 anos, que está internada no hospital com pneumonia. Que Deus realize a cura.", data: "Há 10 minutos", curtidas: 12 },
        { id: "p2", nome: "Presbítero José Carlos", pedido: "Clamo pela vida espiritual dos adolescentes do nosso círculo de oração. Que o Senhor os livre dos caminhos do mal.", data: "Há 32 minutos", curtidas: 8 },
        { id: "p3", nome: "Luciana Santos", pedido: "Intercedo pela libertação do meu esposo das correntes do vício e pela reconciliação em nosso lar.", data: "Há 1 hora", curtidas: 24 }
      ];
      setPrayerRequests(defaultRequests);
      localStorage.setItem("radio_prayers", JSON.stringify(defaultRequests));
    }

    // Dynamic rotation of verses
    const interval = setInterval(() => {
      setCurrentVerseIndex(prev => (prev + 1) % BIBLICAL_VERSES.length);
    }, 15000);

    return () => {
      newSocket.close();
      clearInterval(interval);
    };
  }, []);

  // Scroll to bottom of message logs
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

  // Prayer submit handler
  const handleSendPrayer = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPrayerName.trim() || nickname || "Ouvinte Anônimo";
    const text = newPrayerText.trim();
    if (!text) return;

    const newReq = {
      id: "prayer-" + Date.now(),
      nome: name,
      pedido: text,
      data: "Agora mesmo",
      curtidas: 1
    };

    const updated = [newReq, ...prayerRequests];
    setPrayerRequests(updated);
    localStorage.setItem("radio_prayers", JSON.stringify(updated));

    setNewPrayerText("");
    setPrayerSuccess(true);
    setTimeout(() => setPrayerSuccess(false), 4000);
  };

  // Upvote prayer
  const handleLikePrayer = (id: string) => {
    const updated = prayerRequests.map(p => {
      if (p.id === id) {
        return { ...p, curtidas: p.curtidas + 1 };
      }
      return p;
    });
    setPrayerRequests(updated);
    localStorage.setItem("radio_prayers", JSON.stringify(updated));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-700 selection:text-white" id="portal-root">
      
      {/* Dynamic Header / Navigation Bar with Crimson and Gold styling */}
      <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-red-950/40 shadow-lg px-4 md:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4" id="portal-header">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab("principal")}>
          <div className="w-10 h-10 bg-gradient-to-tr from-red-600 via-red-800 to-amber-500 rounded-xl flex items-center justify-center shadow-md shadow-red-900/30">
            <Radio className="w-5.5 h-5.5 text-white animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] text-amber-400 font-bold tracking-widest uppercase font-mono block">Rádio Gospel</span>
            <h1 className="text-lg md:text-xl font-black font-display tracking-tight text-white flex items-center gap-1.5 uppercase">
              Louvor que <span className="text-red-500 bg-red-950/50 px-2 rounded">Transforma</span>
            </h1>
          </div>
        </div>

        {/* Dynamic Nav Tabs */}
        <nav className="flex flex-wrap items-center justify-center gap-1.5 md:gap-2.5 text-xs font-bold" id="portal-tabs">
          <button
            onClick={() => setActiveTab("principal")}
            className={`px-3 md:px-4 py-2 rounded-lg transition-all ${
              activeTab === "principal"
                ? "bg-red-700 text-white shadow-md shadow-red-900/20 shadow-inner border border-red-500/20"
                : "text-slate-350 hover:text-white hover:bg-slate-900"
            }`}
          >
            Página Principal
          </button>
          <button
            onClick={() => setActiveTab("locutores")}
            className={`px-3 md:px-4 py-2 rounded-lg transition-all ${
              activeTab === "locutores"
                ? "bg-red-700 text-white shadow-md shadow-red-900/20 shadow-inner border border-red-500/20"
                : "text-slate-350 hover:text-white hover:bg-slate-900"
            }`}
          >
            Locutores
          </button>
          <button
            onClick={() => setActiveTab("videos")}
            className={`px-3 md:px-4 py-2 rounded-lg transition-all ${
              activeTab === "videos"
                ? "bg-red-700 text-white shadow-md shadow-red-900/20 shadow-inner border border-red-500/20"
                : "text-slate-350 hover:text-white hover:bg-slate-900"
            }`}
          >
            Vídeos
          </button>
          <button
            onClick={() => setActiveTab("posts")}
            className={`px-3 md:px-4 py-2 rounded-lg transition-all ${
              activeTab === "posts"
                ? "bg-red-700 text-white shadow-md shadow-red-900/20 shadow-inner border border-red-500/20"
                : "text-slate-350 hover:text-white hover:bg-slate-900"
            }`}
          >
            Posts de Fé
          </button>
          
          {/* Pulsing Meeting Room Tab Button */}
          <button
            onClick={() => setActiveTab("sala")}
            className={`relative px-4 py-2 rounded-lg transition-all text-white flex items-center gap-1.5 cursor-pointer ${
              activeTab === "sala"
                ? "bg-amber-500 text-slate-950 font-black shadow-md border border-amber-300/40"
                : "bg-red-950/80 hover:bg-red-900 border border-red-500/30"
            }`}
          >
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
            <Video className="w-3.5 h-3.5" />
            <span>Estúdio Virtual</span>
          </button>
        </nav>
      </header>

      {/* Rotating Biblical Verses Header Strip */}
      <div className="bg-gradient-to-r from-red-950/65 via-slate-950 to-red-950/65 border-b border-red-950/20 py-2.5 px-4 text-center overflow-hidden flex items-center justify-center" id="verse-strip">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentVerseIndex}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3 text-[11px] sm:text-xs max-w-4xl"
          >
            <span className="bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20 font-bold uppercase tracking-widest text-[9px] font-mono shrink-0">
              Palavra de Hoje
            </span>
            <span className="text-slate-200 italic font-medium leading-relaxed">
              "{BIBLICAL_VERSES[currentVerseIndex].texto}"
            </span>
            <strong className="text-amber-400 font-bold shrink-0">
              — {BIBLICAL_VERSES[currentVerseIndex].referencia}
            </strong>
          </motion.div>
        </AnimatePresence>
      </div>

      {activeTab === "principal" && (
        <>
          {/* Hero Banner Grid with high aesthetic Louvor que Transforma Slogan */}
          <section className="relative overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950 border-b border-red-950/30 px-5 py-12 md:py-16 md:px-12 flex flex-col items-center text-center text-white" id="hero-banner">
            {/* Soft decorative background lights */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-650/10 rounded-full filter blur-3xl opacity-30 pointer-events-none"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-550/10 rounded-full filter blur-3xl opacity-20 pointer-events-none"></div>

            <div className="relative max-w-4xl w-full flex flex-col items-center">
              <div className="inline-flex items-center gap-2 bg-red-950/40 border border-red-550/20 px-3.5 py-1.5 rounded-full mb-6">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                <span className="text-[10px] md:text-xs font-bold text-red-300 uppercase tracking-widest font-mono">Transmissão Ao Vivo Oficial</span>
              </div>
              
              <h2 className="text-3xl sm:text-4xl md:text-6.5xl font-black font-display tracking-tight text-white uppercase leading-none drop-shadow-md">
                LOUVOR QUE <span className="bg-gradient-to-r from-red-500 to-amber-500 bg-clip-text text-transparent">TRANSFORMA</span>
              </h2>
              <p className="text-sm md:text-xl text-amber-100/80 font-medium tracking-wide mt-3 max-w-xl">
                "A voz da fé que transforma vidas."
              </p>

              {/* Action grid linking play & chat */}
              <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center w-full max-w-md">
                <button
                  onClick={togglePlayback}
                  className="px-8 py-3.5 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 active:scale-95 text-xs font-black uppercase text-white rounded-xl shadow-lg shadow-red-900/30 transition-all flex items-center justify-center gap-2.5 border border-red-500/20 cursor-pointer"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4 text-white animate-spin" />
                      <span>Pausar Rádio</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 text-white" />
                      <span>ouvir agora</span>
                    </>
                  )}
                </button>
                <a
                  href="#chat-section"
                  className="px-8 py-3.5 bg-slate-900 hover:bg-slate-850 text-xs font-black uppercase text-slate-100 rounded-xl transition-all flex items-center justify-center gap-2.5 border border-slate-750 cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-amber-400" />
                  <span>Ir para o Chat Hermes</span>
                </a>
              </div>
            </div>
          </section>

          {/* Main Layout Portal Grid (Custom Player & Chat side-by-side or stacked desktop-first) */}
          <section className="max-w-7xl mx-auto w-full px-4 py-8 md:py-12 grid grid-cols-1 lg:grid-cols-12 gap-8" id="main-grid">
            
            {/* Columns left: Custom Player, Contacts, Quick requests (lg:col-span-4) */}
            <div className="lg:col-span-4 space-y-8" id="left-column">
              
              {/* Majestic Audio Player */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden" id="custom-radio-player">
                {/* Visual Audio Wave decoration if radio is active */}
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-600 via-amber-500 to-red-600"></div>
                
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-2">
                    <Radio className="w-4 h-4 text-amber-400" />
                    <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase font-mono">Tocando Ao Vivo</span>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                    isPlaying 
                      ? "bg-red-950/80 text-red-400 border border-red-500/30 animate-pulse" 
                      : "bg-slate-950 text-slate-500 border border-slate-850"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? "bg-red-500 animate-ping" : "bg-slate-600"}`}></span>
                    {isPlaying ? "NO AR" : "FORA DO AR"}
                  </span>
                </div>

                {/* Big central design visual: Vinyl or CD spinning */}
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className={`relative w-36 h-36 rounded-full bg-slate-950 border-4 border-slate-800 flex items-center justify-center shadow-xl mb-4 overflow-hidden group ${
                    isPlaying ? "animate-[spin_12s_linear_infinite]" : ""
                  }`}>
                    {/* Vinyl look */}
                    <div className="absolute inset-2 rounded-full border border-slate-800/40"></div>
                    <div className="absolute inset-6 rounded-full border border-slate-750"></div>
                    <div className="absolute inset-10 rounded-full border border-slate-700/60"></div>
                    <div className="w-12 h-12 rounded-full bg-red-700 flex items-center justify-center relative z-10 border-2 border-slate-900">
                      <div className="w-3.5 h-3.5 rounded-full bg-slate-950"></div>
                    </div>
                  </div>

                  <h3 className="text-base font-black text-slate-100 tracking-tight uppercase">Rádio Louvor que Transforma</h3>
                  <p className="text-xs text-amber-400 font-semibold mt-1">"A voz do seu coração"</p>
                  
                  {/* Music audio equalizer decoration */}
                  <div className="h-6 flex items-end justify-center space-x-1.5 mt-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <span 
                        key={i} 
                        className={`w-1 bg-red-600 rounded-full transition-all duration-300 ${
                          isPlaying ? "animate-pulse" : "h-1"
                        }`}
                        style={{ 
                          height: isPlaying ? `${Math.floor(Math.random() * 20) + 4}px` : "4px",
                          animationDelay: `${i * 100}ms`
                        }}
                      ></span>
                    ))}
                  </div>
                </div>

                {/* Interactive Player Controls */}
                <div className="space-y-4 pt-4 border-t border-slate-800/70">
                  {/* Play trigger */}
                  <button
                    onClick={togglePlayback}
                    className={`w-full py-3 px-4 rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      isPlaying 
                        ? "bg-slate-950 text-red-500 hover:bg-slate-900 border border-slate-850" 
                        : "bg-gradient-to-r from-red-600 to-red-800 text-white shadow-lg shadow-red-950/40"
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-4 h-4" />
                        <span>Pausar Transmissão</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Iniciar Transmissão</span>
                      </>
                    )}
                  </button>

                  {/* Volume Slider Block */}
                  <div className="flex items-center space-x-3 bg-slate-950/70 p-3 rounded-xl border border-slate-850">
                    <button 
                      onClick={() => setIsMuted(!isMuted)} 
                      className="text-slate-400 hover:text-white transition-colors"
                      title={isMuted ? "Ativar Áudio" : "Mutar Áudio"}
                    >
                      {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        setVolume(parseFloat(e.target.value));
                        setIsMuted(false);
                      }}
                      className="flex-1 accent-red-600 bg-slate-800 h-1 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-500 font-mono font-bold w-6 text-right">
                      {isMuted ? "0" : Math.round(volume * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Peça Seu Louvor e Clamore Widget Form */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center space-x-2 text-red-500 font-bold mb-3">
                  <Heart className="w-4.5 h-4.5 fill-red-650" />
                  <h4 className="text-sm font-black uppercase tracking-tight text-slate-100">Mural de Oração & Clamor</h4>
                </div>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  Coloque sua família, saúde e negócios nas mãos do Senhor. Sua prece será lida durante os programas de fé.
                </p>

                <form onSubmit={handleSendPrayer} className="space-y-3">
                  <input
                    type="text"
                    required
                    placeholder="Seu nome completo"
                    value={newPrayerName}
                    onChange={(e) => setNewPrayerName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-red-600 px-3 py-2 rounded-lg text-xs focus:outline-none transition-colors"
                  />
                  <textarea
                    required
                    rows={3}
                    placeholder="Escreva aqui o seu clamor ou pedido de cura..."
                    value={newPrayerText}
                    onChange={(e) => setNewPrayerText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-red-600 px-3 py-2 rounded-lg text-xs focus:outline-none transition-colors resize-none"
                  ></textarea>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-gradient-to-r from-red-650 to-red-800 hover:from-red-600 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Cadastrar Pedido de Oração</span>
                  </button>
                </form>

                {/* Success dialog */}
                <AnimatePresence>
                  {prayerSuccess && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-3 p-2 bg-emerald-950/40 text-[10px] text-emerald-400 font-bold rounded-lg border border-emerald-500/20 text-center flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>Clamor gravado para leitura do Pastor! Amém.</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Social links block conforming strictly to the requested red/gold look */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-4">Nossas Redes Sociais</h4>
                <div className="grid grid-cols-2 gap-3 text-center text-xs">
                  <a
                    href="https://youtube.com"
                    target="_blank"
                    rel="noreferrer"
                    className="bg-red-950/30 text-rose-400 hover:text-rose-300 border border-red-500/10 p-3 rounded-xl transition-all font-bold flex flex-col items-center justify-center gap-1.5 hover:bg-slate-850"
                  >
                    <Tv className="w-5 h-5 text-red-500" />
                    <span>Cultos no YouTube</span>
                  </a>
                  <a
                    href="https://facebook.com"
                    target="_blank"
                    rel="noreferrer"
                    className="bg-slate-950 text-blue-400 hover:text-blue-300 border border-slate-850 p-3 rounded-xl transition-all font-bold flex flex-col items-center justify-center gap-1.5 hover:bg-slate-850"
                  >
                    <Award className="w-5 h-5 text-blue-500" />
                    <span>Página Facebook</span>
                  </a>
                </div>
              </div>

            </div>

            {/* Column Center & Right: Majestic Hermes Chat Section (lg:col-span-8) */}
            <div className="lg:col-span-8 space-y-8" id="chat-section">
              
              {banned ? (
                <div className="bg-slate-900 border border-red-900/40 rounded-2xl p-12 text-center shadow-2xl relative overflow-hidden" id="ban-screen">
                  <div className="mx-auto w-12 h-12 bg-red-950/80 border border-red-500/20 rounded-xl flex items-center justify-center mb-4">
                    <X className="w-6 h-6 text-red-400" />
                  </div>
                  <h3 className="text-xl font-bold text-red-300 mb-2 font-display uppercase">Acesso Bloqueado</h3>
                  <p className="text-slate-400 text-sm mb-6">
                    {bannedReason || "Conexão suspensa de acordo com os termos do bate-papo da rádio."}
                  </p>
                  <button 
                    type="button"
                    onClick={() => window.location.reload()} 
                    className="px-6 py-2 bg-red-650 hover:bg-red-500 text-xs font-bold rounded-xl text-white transition-all uppercase"
                  >
                    Recarregar Conexão
                  </button>
                </div>
              ) : (
                <div className="bg-slate-900/90 border-2 border-red-900/30 rounded-2xl shadow-[0_12px_45px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col h-[650px]" id="chat-card">
                  
                  {/* Chat Header designed to look highly professional (Minnit Inspired but tailored for Radio) */}
                  <header className="px-5 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between" id="chat-header">
                    <div className="flex items-center space-x-3">
                      <span className="w-3 h-3 rounded-full bg-red-600 animate-pulse border border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.6)]"></span>
                      <div>
                        <h2 className="text-sm font-black tracking-wider text-slate-100 uppercase font-display flex items-center gap-1.5">
                          BATE-PAPO EXCLUSIVO <span className="bg-amber-400/15 text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded text-[10px] font-mono font-bold">HERMES INTEGRADOR</span>
                        </h2>
                        <p className="text-[10px] text-slate-400 font-medium">
                          Compartilhe testemunhos e fale com a Inteligência Artificial
                        </p>
                      </div>
                    </div>

                    {/* Online Listeners Counter in Chat Header */}
                    <div className="flex items-center space-x-1.5 bg-slate-950/95 px-3 py-1.5 rounded-full border border-red-950/40 shadow-inner">
                      <Users className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-bold text-slate-100">{onlineCount}</span>
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider hidden sm:inline">Conectados</span>
                    </div>
                  </header>

                  {/* Nickname identity management component */}
                  <div className="px-5 py-3 bg-slate-950/40 border-b border-slate-800/60 flex items-center justify-between text-xs" id="nickname-bar">
                    {isEditingName ? (
                      <form 
                        onSubmit={handleSaveNickname}
                        className="flex items-center space-x-2 w-full"
                      >
                        <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider shrink-0">Apelido:</span>
                        <input
                          type="text"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          maxLength={18}
                          className="flex-1 bg-slate-900 border border-slate-750 focus:border-red-600 text-xs px-2.5 py-1 text-slate-200 rounded focus:outline-none col h-8 font-mono"
                          autoFocus
                        />
                        <button 
                          type="submit"
                          className="p-1 text-emerald-400 hover:text-emerald-300 bg-slate-950 rounded border border-slate-800 hover:bg-slate-850 h-8 w-8 flex items-center justify-center transition-all shrink-0 cursor-pointer"
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
                          className="p-1 text-slate-400 hover:text-slate-200 bg-slate-950 rounded border border-slate-800 hover:bg-slate-850 h-8 w-8 flex items-center justify-center transition-all shrink-0 cursor-pointer"
                          title="Cancelar"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center justify-between w-full text-slate-400">
                        <div className="flex items-center space-x-2">
                          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Identificação:</span>
                          <span className="text-red-400 font-mono tracking-tight text-xs font-bold bg-slate-950/80 px-2.5 py-0.5 rounded border border-red-500/10 shadow-inner">
                            {nickname || "Gerando nome..."}
                          </span>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setIsEditingName(true)}
                          className="flex items-center space-x-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-850 px-2.5 py-1 border border-slate-800 hover:border-slate-700 bg-slate-950/80 rounded transition-all font-bold cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3 text-slate-500" />
                          <span className="text-[10px] uppercase tracking-wider">Alterar</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Real-time Message scrolling viewport */}
                  <div 
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto px-5 py-5 space-y-4 bg-slate-950/30"
                    id="chat-feed"
                  >
                    <AnimatePresence initial={false}>
                      {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                          <MessageSquare className="w-10 h-10 text-slate-750 animate-bounce" />
                          <p className="text-slate-350 text-xs font-black uppercase tracking-wider">O bate-papo está aberto</p>
                          <p className="text-slate-600 text-[11px] max-w-xs leading-relaxed">
                            Interaja com os outros crentes enviando uma mensagem, ou use a inteligência artificial da rádio digitando <strong className="text-red-400 font-mono">@hermes</strong>!
                          </p>
                        </div>
                      ) : (
                        messages.map((msg) => {
                          const isHermes = msg.tipo === "hermes" || msg.usuario.includes("Hermes");
                          const isSystem = msg.tipo === "sistema" || msg.usuario === "Sistema";

                          // Style definitions mapping clean chat visuals
                          let bubbleBg = "bg-slate-850 text-slate-100 border-slate-750";
                          let authorColor = "text-amber-400";
                          let textStyle = "text-[13px] leading-relaxed break-words text-slate-200 mt-1";

                          if (isHermes) {
                            bubbleBg = "bg-gradient-to-r from-red-950/50 to-slate-900 border-red-500/25 shadow-md shadow-red-950/20";
                            authorColor = "text-amber-400 font-black flex items-center gap-1 uppercase tracking-wide text-[10px] font-mono";
                          } else if (isSystem) {
                            bubbleBg = "bg-slate-950/70 border-slate-850/60";
                            authorColor = "text-slate-500 font-bold uppercase tracking-wider text-[10px] font-mono";
                            textStyle = "text-xs italic text-slate-400 mt-1";
                          } else {
                            // Regular users
                            bubbleBg = "bg-slate-900/60 border-slate-800 text-slate-100 hover:border-slate-750";
                            authorColor = "text-red-400 font-bold font-mono tracking-tight";
                          }

                          return (
                            <motion.div
                              key={msg.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              className="flex flex-col items-start w-full"
                            >
                              <div className={`p-3.5 rounded-xl border w-full text-left ${bubbleBg} transition-all`}>
                                <div className="flex items-center justify-between border-b border-slate-800/40 pb-1.5 mb-1.5">
                                  <span className={`${authorColor} text-[11px]`}>
                                    {isHermes ? (
                                      <span className="flex items-center gap-1">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                                        <span>{msg.usuario}</span>
                                      </span>
                                    ) : msg.usuario}
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-mono font-bold">
                                    {new Date(msg.datahora).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>
                                <p className={textStyle}>
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

                  {/* Guidance and Server connection active status banner */}
                  <div className="px-5 py-2.5 bg-slate-950 border-t border-slate-850 flex items-center justify-between text-[10px] text-slate-500 font-medium">
                    <span className="flex items-center gap-1.5">
                      <Megaphone className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>Digite <strong className="text-red-400">@hermes</strong> caso queira receber conselhos de fé da nossa IA VPS</span>
                    </span>
                    {connected ? (
                      <span className="text-red-500 font-bold uppercase tracking-wider flex items-center gap-1 shrink-0 font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-ping"></span>
                        Servidor Conectado
                      </span>
                    ) : (
                      <span className="text-amber-500 font-bold uppercase tracking-wider flex items-center gap-1 shrink-0 font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block animate-bounce"></span>
                        Conectando...
                      </span>
                    )}
                  </div>

                  {/* Messaging send box layout */}
                  <form 
                    onSubmit={handleSendMessage} 
                    className="p-4 bg-slate-950/80 border-t border-slate-800 flex gap-2.5"
                    id="chat-input-form"
                  >
                    <input
                      type="text"
                      placeholder="Prezada rádio Louvor que Transforma..."
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-850 hover:border-slate-750 focus:border-red-650 text-sm text-slate-200 rounded-xl px-4 py-3 focus:outline-none transition-colors placeholder:text-slate-500 h-11.5"
                      id="message-text-field"
                    />
                    <button 
                      type="submit"
                      className="whitespace-nowrap px-6 bg-red-750 hover:bg-red-600 active:scale-95 text-xs font-black uppercase rounded-xl text-white transition-all flex items-center justify-center space-x-1.5 shadow-md shadow-red-950/40 cursor-pointer h-11.5"
                      id="send-msg-btn"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Enviar</span>
                    </button>
                  </form>

                </div>
              )}

              {/* Real-time Prayer Request Board Wall (Mural de Testemunhos) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <BookOpen className="w-5 h-5 text-amber-400" />
                    <h3 className="text-base font-black text-slate-100 uppercase tracking-tight font-display">Clamores da Comunidade</h3>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono font-bold">Ultimos pedidos ativos</span>
                </div>

                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                  {prayerRequests.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs italic">Nenhum clamor registrado. Cadastre o seu acima!</div>
                  ) : (
                    prayerRequests.map((req) => (
                      <div key={req.id} className="p-4 bg-slate-950/70 border border-slate-850 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-350 font-mono flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-red-500" /> {req.nome}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono font-bold">{req.data}</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed font-sans">{req.pedido}</p>
                        
                        <div className="flex items-center space-x-3 pt-2 border-t border-slate-900">
                          <button
                            type="button"
                            onClick={() => handleLikePrayer(req.id)}
                            className="flex items-center space-x-1 text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors"
                          >
                            <Heart className="w-3.5 h-3.5 fill-red-500/20" />
                            <span>Amém ({req.curtidas})</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </section>
        </>
      )}

      {activeTab === "locutores" && (
        <section className="max-w-6xl mx-auto w-full px-4 py-12 space-y-8" id="locutores-view">
          <div className="text-center space-y-2 max-w-xl mx-auto">
            <Radio className="w-8 h-8 text-red-500 mx-auto" />
            <h2 className="text-2xl md:text-3xl font-black font-display text-white uppercase tracking-tight">Nossa Grade de Locutores</h2>
            <p className="text-slate-400 text-xs md:text-sm">
              Conheça os mensageiros que dão a voz para a fé que transforma vidas pela Rádio Louvor que Transforma.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            {LOCUTORES.map((l) => (
              <div key={l.id} className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col sm:flex-row gap-5 hover:border-slate-700 transition-all shadow-xl">
                <img 
                  src={l.foto} 
                  alt={l.nome} 
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-cover border border-slate-700 shrink-0 self-center sm:self-start bg-slate-950" 
                  referrerPolicy="no-referrer"
                />
                <div className="space-y-2 flex-1">
                  <span className="bg-red-950/60 border border-red-500/20 text-red-400 font-bold uppercase tracking-widest text-[9px] font-mono px-2.5 py-1 rounded">
                    {l.horario}
                  </span>
                  <h3 className="text-lg font-black text-slate-100 font-display mt-1">{l.nome}</h3>
                  <h4 className="text-xs text-amber-400 font-bold uppercase tracking-tight">{l.programa}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed pt-1">{l.descricao}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "videos" && (
        <section className="max-w-6xl mx-auto w-full px-4 py-12 space-y-8" id="videos-view">
          <div className="text-center space-y-2 max-w-xl mx-auto">
            <Tv className="w-8 h-8 text-amber-400 mx-auto" />
            <h2 className="text-2xl md:text-3xl font-black font-display text-white uppercase tracking-tight">Vídeos e Clashes de Fé</h2>
            <p className="text-slate-400 text-xs md:text-sm">
              Assista pregações gravadas, ministrações intensas e as melhores reflexões edificantes em alta definição.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            {VIDEOS.map((v) => (
              <div key={v.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl hover:border-slate-700 transition-all flex flex-col group">
                <div className="relative aspect-video bg-slate-950 overflow-hidden">
                  <img 
                    src={v.thumb} 
                    alt={v.titulo} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-slate-950/40 flex items-center justify-center">
                    <div className="w-11 h-11 rounded-full bg-red-650 hover:bg-red-550 border border-red-500/30 flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
                      <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                    </div>
                  </div>
                  <span className="absolute bottom-2 right-2 bg-slate-950/80 px-2 py-0.5 rounded text-[9px] font-mono font-bold text-slate-350">
                    {v.duracao}
                  </span>
                </div>
                <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                  <h3 className="text-xs font-bold text-slate-100 line-clamp-2 leading-snug">{v.titulo}</h3>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono font-bold pt-2 border-t border-slate-850">
                    <span>{v.visualizacoes}</span>
                    <span className="text-amber-450">FÉ GRAVADA</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "posts" && (
        <section className="max-w-4xl mx-auto w-full px-4 py-12 space-y-8" id="posts-view">
          <div className="text-center space-y-2 max-w-xl mx-auto">
            <BookOpen className="w-8 h-8 text-amber-400 mx-auto" />
            <h2 className="text-2xl md:text-3xl font-black font-display text-white uppercase tracking-tight">Estudos & Mensagens de Oração</h2>
            <p className="text-slate-400 text-xs md:text-sm">
              Artigos diários escritos por nossos pastores para encher as vossas mentes de luz nas horas difíceis.
            </p>
          </div>

          <div className="space-y-6 pt-4">
            {POSTS.map((p) => (
              <div key={p.id} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 hover:border-slate-750 transition-all shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="bg-amber-400/10 text-amber-400 px-2.5 py-0.5 rounded border border-amber-500/20 font-bold uppercase text-[9px] font-mono tracking-widest text-[9px]">
                    {p.categoria}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono font-bold">{p.data}</span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-slate-100 font-display leading-tight">{p.titulo}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{p.resumo}</p>
                <div className="flex items-center justify-between pt-3 border-t border-slate-850 text-xs">
                  <button className="flex items-center space-x-1.5 font-bold text-red-400 hover:text-red-300">
                    <Heart className="w-4 h-4 fill-red-500/10" />
                    <span>Curtir Mensagem ({p.curtidas})</span>
                  </button>
                  <span className="text-slate-500 font-mono font-semibold">Leitura livre</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "sala" && (
        <section className="max-w-6xl mx-auto w-full px-4 py-12 space-y-8" id="whereby-view">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <Video className="w-8 h-8 text-amber-400 mx-auto animate-bounce" />
            <h2 className="text-2xl md:text-3.5xl font-black font-display text-white uppercase tracking-tight">Estúdio de Estudo Bíblico & Podcast</h2>
            <p className="text-slate-400 text-xs md:text-sm leading-relaxed">
              Bem-vindo ao nosso Templo de Comunhão Virtual. Participe de estudos bíblicos coletivos, orações em grupo fechado ao vivo e podcasts comandados por nossos pastores!
            </p>
          </div>

          <div className="bg-slate-900/90 border-2 border-amber-400/25 p-2 rounded-2xl shadow-2xl relative overflow-hidden">
            {/* Whereby Live study meeting room IFrame */}
            <iframe 
              src="https://automacaojs.whereby.com/reuniao-2-geral844215f8-32fa-48cf-a5d0-91ac716888e7" 
              allow="camera; microphone; fullscreen; speaker; display-capture; compute-pressure" 
              style={{ height: "650px", width: "100%", borderRadius: "12px", border: "none" }}
              title="Estúdio Virtual de Estudos Bíblicos"
            ></iframe>
          </div>

          <div className="bg-slate-950 p-4 border border-slate-850 rounded-xl text-center text-[11px] text-slate-500">
            ⚠️ Certifique-se de conceder acesso à sua câmera e microfone para participar ativamente com os oradores.
          </div>
        </section>
      )}

      {/* Portal Footer conforming strictly with translation metadata rules */}
      <footer className="mt-auto bg-slate-950 border-t border-red-950/40 py-8 px-4 text-center text-xs text-slate-500 space-y-3" id="portal-footer">
        <p className="font-bold text-slate-400 tracking-wider uppercase font-display">
          © 2026 Rádio Louvor que Transforma — Todos os direitos reservados.
        </p>
        <p className="text-[10px] max-w-lg mx-auto leading-relaxed">
          Sintonizados na fidelidade ao Senhor Jesus Cristo. Emissão operando em tempo real integrando agentes de inteligência artificial de forma não invasiva e direta.
        </p>
        <div className="flex items-center justify-center space-x-1.5 text-[9px] font-mono">
          <span className="bg-red-950/60 px-2 py-0.5 border border-red-500/20 text-red-400 rounded">SSL Ativo</span>
          <span className="bg-slate-900 px-2 py-0.5 border border-slate-800 text-slate-400 rounded">Porta Ingress: 3000</span>
        </div>
      </footer>

    </div>
  );
}
