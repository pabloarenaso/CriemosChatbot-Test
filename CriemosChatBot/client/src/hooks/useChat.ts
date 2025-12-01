import { useState, useEffect, useCallback } from "react";
import type { Message } from "@shared/schema";
import {
  getOrCreateSessionId,
  loadMessages,
  saveMessages,
  createMessage,
} from "@/lib/chatUtils";

const WELCOME_MESSAGE = "Hola! Soy el asistente de Criemos. ¿En qué puedo ayudarte?";

// 👉 leemos la URL del webhook de n8n desde las env de Vite
const N8N_WEBHOOK_URL =
  import.meta.env.VITE_N8N_WEBHOOK_URL || "http://localhost:5678/webhook/criemos-chatbot";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [sessionId] = useState(getOrCreateSessionId);

  useEffect(() => {
    const stored = loadMessages();
    if (stored.length > 0) {
      setMessages(stored);
      setShowQuickReplies(stored.length === 1 && stored[0].sender === "bot");
    } else {
      const welcomeMsg = createMessage(WELCOME_MESSAGE, "bot");
      setMessages([welcomeMsg]);
      saveMessages([welcomeMsg]);
      setShowQuickReplies(true);
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const userMessage = createMessage(text, "user");
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      saveMessages(newMessages);
      setShowQuickReplies(false);
      setIsTyping(true);

      try {
        if (!N8N_WEBHOOK_URL) {
          throw new Error("Falta VITE_N8N_WEBHOOK_URL en el .env");
        }

        const response = await fetch(N8N_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: sessionId,
            text,
            channel: "webchat",
          }),
        });

        if (!response.ok) {
          throw new Error("Error al enviar mensaje");
        }

        const data = await response.json();

        const botMessage = createMessage(
          // asumimos que tu workflow devuelve { "text": "respuesta..." }
          data.text ||
            "Lo siento, no pude procesar tu mensaje. Por favor intenta de nuevo.",
          "bot"
        );

        const updatedMessages = [...newMessages, botMessage];
        setMessages(updatedMessages);
        saveMessages(updatedMessages);

        // si tu workflow devuelve quickReplies, las mostramos
        if (data.quickReplies && data.quickReplies.length > 0) {
          setShowQuickReplies(true);
        }
      } catch (error) {
        console.error("Chat error:", error);
        const errorMessage = createMessage(
          "Disculpa, hubo un problema al conectar con el servidor. Por favor intenta de nuevo en unos momentos.",
          "bot"
        );
        const updatedMessages = [...newMessages, errorMessage];
        setMessages(updatedMessages);
        saveMessages(updatedMessages);
      } finally {
        setIsTyping(false);
      }
    },
    [messages, sessionId]
  );

  const handleQuickReply = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage]
  );

  return {
    messages,
    isTyping,
    showQuickReplies,
    sendMessage,
    handleQuickReply,
    sessionId,
  };
}
