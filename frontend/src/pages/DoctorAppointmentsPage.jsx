import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getMyAppointments } from '../api/doctorApi';
import { toDateInputValue, addDays, dateInputToStartOfDayIso, dateInputToExclusiveEndIso } from '../utils/dateInput';

function formatRange(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const endTime = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${dateStr} · ${startTime} - ${endTime}`;
}

export default function DoctorAppointmentsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [startDate, setStartDate] = useState(() => toDateInputValue(new Date()));
  const [endDate, setEndDate] = useState(() => toDateInputValue(addDays(new Date(), 30)));
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isDoctor = Boolean(user && user.is_doctor);

  const fetchAppointments = useCallback(async () => {
    if (!isDoctor) return;
    setLoading(true);
    setError('');
    try {
      const data = await getMyAppointments(dateInputToStartOfDayIso(startDate), dateInputToExclusiveEndIso(endDate));
      setAppointments(data.appointments);
    } catch (err) {
      setError(err.message || 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [isDoctor, startDate, endDate]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  if (!user || !user.is_doctor) {
    return <Navigate to="/chat" replace />;
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="page doctor-page">
      <header className="chat-header">
        <div>
          <h1>My Schedule</h1>
          <p className="subtitle">{user.name}</p>
        </div>
        <div className="header-actions">
          <Link className="login-link" to="/chat">
            Chat
          </Link>
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <div className="doctor-controls">
        <label>
          From
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button type="button" onClick={fetchAppointments} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="form-error doctor-error">{error}</p>}

      <div className="appointment-list">
        {!loading && !error && appointments.length === 0 && <p className="empty-state">No appointments in this range.</p>}
        {appointments.map((a) => (
          <div key={a.appointment_id} className={`appointment-row appointment-${a.status}`}>
            <span className="appointment-time">{formatRange(a.start_datetime, a.end_datetime)}</span>
            <span className="appointment-patient">{a.patient_name || 'Guest'}</span>
            <span className="appointment-contact">
              {a.mobile_number} · {a.email}
            </span>
            <span className="appointment-status">{a.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
