export default function MessageList({ messages }) {
  return (
    <div className="message-list">
      {messages.map((m) => (
        <div key={m.id} className={`message message-${m.sender}${m.pending ? ' message-pending' : ''}`}>
          <span className="message-text">{m.text}</span>
        </div>
      ))}
    </div>
  );
}
