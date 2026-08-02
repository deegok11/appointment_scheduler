import { useRef, useState } from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { sendMessage } from '../../api/chatApi';

let nextId = 1;

const WELCOME_TEXT =
  "Hi! I'm your scheduling assistant. Ask me to find a doctor, check availability, or book, cancel, or look up an appointment.";
const TYPING_TEXT = '…';

export default function ChatWindow() {
  const [messages, setMessages] = useState([{ id: nextId++, sender: 'assistant', text: WELCOME_TEXT }]);
  const [isSending, setIsSending] = useState(false);
  // Only actually used by the backend for guest (not-logged-in) chats, to key
  // server-side history -- logged-in requests use the auth session instead.
  // Generated once per mount, so a page refresh starts a fresh guest chat.
  const guestSessionId = useRef(crypto.randomUUID());

  async function handleSend(text) {
    const userMessage = { id: nextId++, sender: 'user', text };
    const typingId = nextId++;
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: typingId, sender: 'assistant', text: TYPING_TEXT, pending: true },
    ]);
    setIsSending(true);

    try {
      const { reply } = await sendMessage(text, guestSessionId.current);
      setMessages((prev) => prev.map((m) => (m.id === typingId ? { id: typingId, sender: 'assistant', text: reply } : m)));
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === typingId
            ? { id: typingId, sender: 'error', text: err.message || 'Something went wrong. Please try again.' }
            : m
        )
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="chat-window">
      <MessageList messages={messages} />
      <MessageInput onSend={handleSend} disabled={isSending} />
    </div>
  );
}
