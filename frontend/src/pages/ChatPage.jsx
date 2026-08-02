import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import ChatWindow from '../components/chat/ChatWindow';

export default function ChatPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="page chat-page">
      <header className="chat-header">
        <div>
          <h1>Scheduler Assistant</h1>
          <p className="subtitle">{user ? `Signed in as ${user.name}` : 'Chatting as a guest'}</p>
        </div>
        <div className="header-actions">
          {user?.is_doctor && (
            <Link className="login-link" to="/doctor">
              My Schedule
            </Link>
          )}
          {user ? (
            <button type="button" onClick={handleLogout}>
              Log out
            </button>
          ) : (
            <Link className="login-link" to="/login">
              Log in
            </Link>
          )}
        </div>
      </header>
      <ChatWindow />
    </div>
  );
}
