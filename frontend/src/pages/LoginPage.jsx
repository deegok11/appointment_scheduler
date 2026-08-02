import { Link } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="page login-page">
      <div className="login-card">
        <h1>Scheduler Assistant</h1>
        <p className="subtitle">Sign in to manage your appointments</p>
        <LoginForm />
        <Link className="guest-link" to="/chat">
          Continue without logging in
        </Link>
      </div>
    </div>
  );
}
