import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import * as dotenv from "dotenv";
import { getSupabase, isSupabaseConfigured } from "./src/lib/supabase.js";
import { ChatMessage, UserSession } from "./src/types.js";
// Dograh integration: handled by Python stdlib service site-dograh-callback.service (port 8129)
// proxied via nginx location /api/dograh/. Do NOT add Express routes here — production is nginx-static.

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = 3000;

// Set up CORS
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"]
}));

app.use(express.json());

// Dograh integration: handled by Python stdlib service site-dograh-callback.service (port 8129)
// proxied via nginx location /api/dograh/. Do NOT add Express routes here — production is nginx-static.

// In-Memory Fallback State (when Supabase is not configured or offline)
const localMessages: ChatMessage[] = [];
const activeUsers: Record<string, UserSession> = {};
const silencedUsers = new Set<string>(); // Set of username strings
const bannedUsers = new Set<string>(); // Set of username strings
const moderatorLogs: string[] = [];

// Helper to save a message
async function saveMessage(usuario: string, mensagem: string, tipo: "usuario" | "hermes" | "sistema"): Promise<ChatMessage> {
  const messageData: ChatMessage = {
    id: Math.random().toString(36).substring(2, 11) + Date.now(),
    usuario,
    mensagem,
    datahora: new Date().toISOString(),
    tipo
  };

  const supabase = getSupabase();
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("mensagens")
        .insert({
          usuario: messageData.usuario,
          mensagem: messageData.mensagem,
          tipo: messageData.tipo,
          datahora: messageData.datahora
        })
        .select();

      if (error) {
        console.error("Error inserting into Supabase: ", JSON.stringify(error, null, 2));
        localMessages.push(messageData); // fallback
        return messageData;
      }
      
      if (data && data[0]) {
        return {
          id: data[0].id.toString(),
          usuario: data[0].usuario,
          mensagem: data[0].mensagem,
          datahora: data[0].datahora,
          tipo: data[0].tipo
        };
      }
    } catch (e) {
      console.error("Supabase exception, falling back to local memory: ", e);
    }
  }

  // Fallback to local memory limit to last 200 messages
  localMessages.push(messageData);
  if (localMessages.length > 200) {
    localMessages.shift();
  }
  return messageData;
}

// Fetch the last 50 messages
async function getLastMessages(): Promise<ChatMessage[]> {
  const supabase = getSupabase();
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("mensagens")
        .select("*")
        .order("datahora", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error querying Supabase: ", JSON.stringify(error, null, 2));
        return [...localMessages].reverse(); // fallback
      }
      
      // Supabase returns in descending order, reverse it to get chronological order
      return (data || []).map((msg: any) => ({
        id: msg.id.toString(),
        usuario: msg.usuario,
        mensagem: msg.mensagem,
        datahora: msg.datahora,
        tipo: msg.tipo
      })).reverse();
    } catch (e) {
      console.error("Supabase fetch exception, using local memo: ", e);
    }
  }
  return localMessages;
}

// Delete message helper
async function deleteMessage(id: string): Promise<boolean> {
  const supabase = getSupabase();
  if (isSupabaseConfigured && supabase) {
    try {
      // First try deleting as UUID or general id
      const { error } = await supabase
        .from("mensagens")
        .delete()
        .eq("id", id);
        
      if (!error) return true;
      console.warn("Supabase normal delete failed, trying integer mapping: ", error);
      
      // If it fails (e.g. ID is integer in backend but string representation), try converting
      const numericId = parseInt(id, 10);
      if (!isNaN(numericId)) {
        await supabase
          .from("mensagens")
          .delete()
          .eq("id", numericId);
      }
    } catch (e) {
      console.error("Supabase delete error: ", e);
    }
  }
  
  const index = localMessages.findIndex(m => m.id === id);
  if (index !== -1) {
    localMessages.splice(index, 1);
    return true;
  }
  return true;
}

// Socket.io Setup
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Broadcast online users count
const broadcastOnlineStatus = () => {
  const onlineCount = Object.keys(activeUsers).length;
  io.emit("system-status", {
    onlineCount,
    users: Object.values(activeUsers).map(u => ({ usuario: u.usuario, isModerator: u.isModerator })),
    isSupabaseConnected: isSupabaseConfigured
  });
};

// Send request to Hermes VPS API and poll for the response
async function triggerHermesAgent(userMessage: string) {
  const hermesBaseUrl = process.env.HERMES_API_URL || "http://156.67.31.108:9900";
  const postUrl = `${hermesBaseUrl.replace(/\/$/, "")}/mensagem`;
  
  console.log(`Sending prompt to Hermes API at: ${postUrl}`);
  
  try {
    const payload = {
      message: userMessage
    };

    // 1. Send initial POST request
    const response = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Hermes API returned status code ${response.status}`);
    }

    const initialData = await response.json();
    console.log("Initial Hermes POST response received:", initialData);
    
    const taskId = initialData.id;
    if (!taskId) {
      throw new Error("No response ID returned from Hermes agent.");
    }

    // 2. Broadcast immediately to everyone that Hermes is processing
    const waitingMsg = await saveMessage(
      "Sistema", 
      "Hermes está preparando uma resposta...", 
      "sistema"
    );
    io.emit("chat-message", waitingMsg);

    // 3. Start Polling the GET /resposta/{id} endpoint every 3 seconds
    let attempts = 0;
    const maxAttempts = 60; // 3 minutes timeout
    const pollInterval = setInterval(async () => {
      attempts++;
      const pollUrl = `${hermesBaseUrl.replace(/\/$/, "")}/resposta/${taskId}`;
      
      try {
        const pollResponse = await fetch(pollUrl);
        if (!pollResponse.ok) {
          console.warn(`Polling attempt ${attempts} returned status: ${pollResponse.status}`);
          return;
        }

        const pollResult = await pollResponse.json();
        console.log(`Polling status for ${taskId} (Attempt ${attempts}):`, pollResult);

        // Check if finished
        if (pollResult.status === "pronto" && pollResult.resposta) {
          // Success! Save response as 'hermes' type and broadcast
          clearInterval(pollInterval);
          const finalMsg = await saveMessage("🤖 Hermes", pollResult.resposta, "hermes");
          io.emit("chat-message", finalMsg);
        } else if (attempts >= maxAttempts) {
          // Timeout reached
          clearInterval(pollInterval);
          const timeoutMsg = await saveMessage(
            "Sistema", 
            "Tempo limite esgotado. O Hermes demorou muito para responder ou a VPS está sob carga excessiva.", 
            "sistema"
          );
          io.emit("chat-message", timeoutMsg);
        }
      } catch (pollErr: any) {
        console.error(`Error during polling attempt ${attempts}:`, pollErr.message);
      }
    }, 3000);

  } catch (error: any) {
    console.error("Failed to connect or initiate Hermes API:", error.message);
    const errorMsg = await saveMessage(
      "Sistema", 
      `Erro de conexão ao iniciar Hermes VPS. Favor verificar se a VPS em ${hermesBaseUrl} está acessível.`, 
      "sistema"
    );
    io.emit("chat-message", errorMsg);
  }
}

// Socket.io logical handlers
io.on("connection", async (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  
  let currentUsername = "";
  let isModerator = false;

  // Handle User Handshake / Login / Join
  socket.on("join-chat", async (data: { usuario?: string; isModerator?: boolean }) => {
    // Generate standard auto name if none provided
    let nick = (data.usuario || "").trim();
    if (!nick) {
      nick = `Ouvinte-${Math.floor(100 + Math.random() * 900)}`;
    }

    // Guard Banned names
    if (bannedUsers.has(nick.toLowerCase())) {
      socket.emit("ban-status", { banned: true, reason: "Você foi banido deste chat." });
      socket.disconnect();
      return;
    }

    currentUsername = nick;
    isModerator = !!data.isModerator;

    activeUsers[socket.id] = {
      socketId: socket.id,
      usuario: currentUsername,
      isModerator: isModerator
    };

    console.log(`[Join] User joining: ${currentUsername} (Mod: ${isModerator})`);
    
    // Send historical messages to client
    const history = await getLastMessages();
    socket.emit("init-messages", history);

    // Notify about active status
    broadcastOnlineStatus();

    // Broadcast system join notification to other users in real-time
    const joinMsg = await saveMessage("Sistema", `${currentUsername} entrou no chat da rádio!`, "sistema");
    socket.broadcast.emit("chat-message", joinMsg);

    // Welcome message payload (private to the connected listener)
    socket.emit("chat-message", {
      id: "welcome-system",
      usuario: "Sistema",
      mensagem: `Bem-vindo ao Chat da Rádio! Você está conectado como ${currentUsername}. ${
        isSupabaseConfigured ? "🟢 Banco de dados Supabase Conectado." : "🟡 Modo Memorial Ativo (Supabase não configurado)."
      }`,
      datahora: new Date().toISOString(),
      tipo: "sistema"
    });
  });

  // Handle incoming User Messages
  socket.on("send-message", async (text: string) => {
    if (!currentUsername) return;
    const msgText = (text || "").trim();
    if (!msgText) return;

    // Is the user banned now?
    if (bannedUsers.has(currentUsername.toLowerCase())) {
      socket.emit("ban-status", { banned: true, reason: "Você foi banido." });
      socket.disconnect();
      return;
    }

    // Is the user silenced?
    if (silencedUsers.has(currentUsername.toLowerCase())) {
      socket.emit("chat-message", {
        id: "sys-silence-warning-" + Date.now(),
        usuario: "Sistema",
        mensagem: "Ops! Você está silenciado no momento e não pode enviar mensagens.",
        datahora: new Date().toISOString(),
        tipo: "sistema"
      });
      return;
    }

    // ---- PARSE MODERATOR COMMANDS ----
    if (isModerator && msgText.startsWith("/")) {
      const parts = msgText.split(" ");
      const command = parts[0].toLowerCase();
      const targetUser = parts.slice(1).join(" ").trim();

      if (command === "/silenciar" && targetUser) {
        silencedUsers.add(targetUser.toLowerCase());
        moderatorLogs.push(`[Silen] Mod silenciou ${targetUser}`);
        const infoMsg = await saveMessage("Sistema", `O ouvinte @${targetUser} foi silenciado pelo moderador.`, "sistema");
        io.emit("chat-message", infoMsg);
        io.emit("moderator-logs", moderatorLogs);
        return;
      }

      if (command === "/banir" && targetUser) {
        bannedUsers.add(targetUser.toLowerCase());
        moderatorLogs.push(`[Ban] Mod baniu ${targetUser}`);
        
        // Find socket of targetUser to disconnect
        const targetSocketId = Object.keys(activeUsers).find(
          key => activeUsers[key].usuario.toLowerCase() === targetUser.toLowerCase()
        );
        if (targetSocketId) {
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) {
            targetSocket.emit("ban-status", { banned: true });
            targetSocket.disconnect();
          }
        }

        const infoMsg = await saveMessage("Sistema", `O ouvinte @${targetUser} foi banido pelo moderador.`, "sistema");
        io.emit("chat-message", infoMsg);
        io.emit("moderator-logs", moderatorLogs);
        return;
      }

      if (command === "/apagar" && targetUser) {
        // Here targetUser is actually the message ID
        await deleteMessage(targetUser);
        moderatorLogs.push(`[Apagar] Mod deletou a mensagem ID: ${targetUser}`);
        io.emit("message-deleted", targetUser);
        io.emit("moderator-logs", moderatorLogs);
        return;
      }
    }

    // Save & Broadcast standard message
    const savedMsg = await saveMessage(currentUsername, msgText, "usuario");
    io.emit("chat-message", savedMsg);

    // ---- INTEGRATION WITH HERMES ----
    const lowerMessage = msgText.toLowerCase();
    if (lowerMessage.startsWith("@hermes") || lowerMessage.includes("hermes")) {
      // Trigger Hermes VPS API
      triggerHermesAgent(msgText);
    }
  });

  // Handle manual self-claiming of moderator privileges (for ease of showcase and testing)
  socket.on("claim-moderator", (status: boolean) => {
    if (activeUsers[socket.id]) {
      activeUsers[socket.id].isModerator = status;
      isModerator = status;
      socket.emit("chat-message", {
        id: "sys-mod-" + Date.now(),
        usuario: "Sistema",
        mensagem: status ? "Você agora possui privilégios de Moderador! Use os comandos: /silenciar, /banir ou clique em apagar nas mensagens." : "Privilégios de moderador removidos.",
        datahora: new Date().toISOString(),
        tipo: "sistema"
      });
      broadcastOnlineStatus();
    }
  });

  // Handle client disconnection
  socket.on("disconnect", async () => {
    if (currentUsername && activeUsers[socket.id]) {
      delete activeUsers[socket.id];
      console.log(`Socket disconnected client: ${currentUsername}`);
      broadcastOnlineStatus();

      // Show exit status update: "Mostrar entrada e saída dos usuários"
      const leaveMsg = await saveMessage("Sistema", `${currentUsername} saiu do chat da rádio.`, "sistema");
      io.emit("chat-message", leaveMsg);
    }
  });
});

// ==== ENDPOINTS HTTP ====

// Webhook for Hermes VPS to post back response to the live room chat!
app.post("/api/hermes/webhook", async (req, res) => {
  console.log("Webhook callback received from Hermes:", req.body);
  const { response, responseText, mensagem, text, textResponse } = req.body;
  const replyContent = response || responseText || mensagem || text || textResponse || "";

  if (!replyContent) {
    return res.status(400).json({ status: "error", message: "Nenhum conteúdo de mensagem identificado no payload JSON." });
  }

  // Save the Message as 'hermes' type
  const savedMsg = await saveMessage("Hermes", replyContent, "hermes");
  
  // Emit to all connected sockets
  io.emit("chat-message", savedMsg);

  return res.status(200).json({ status: "success", received: true, id: savedMsg.id });
});

// Health / Status endpoint showing config details
app.get("/api/config-status", (req, res) => {
  res.json({
    supabaseConfigured: isSupabaseConfigured,
    supabaseUrl: process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.substring(0, 15)}...` : undefined,
    hermesApiUrl: process.env.HERMES_API_URL || "http://localhost:9900",
    localPort: PORT,
    environment: process.env.NODE_ENV || "development"
  });
});

// Serve frontend assets cleanly
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

setupVite().then(() => {
  // Bind to Port 3000 & Host 0.0.0.0
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Web Radio Server matches port: http://0.0.0.0:${PORT}`);
  });
});
