import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { auth } from './api.js';
import Navbar from './components/Navbar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Tracker from './pages/Tracker.jsx';
import Analytics from './pages/Analytics.jsx';
import JobDetail from './pages/JobDetail.jsx';
import Search from './pages/Search.jsx';
import Resumes from './pages/Resumes.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import './index.css';

export const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('jobhunter_token');
    if (token) {
      auth.me().then(data => {
        setUser(data.user);
      }).catch(() => {
        localStorage.removeItem('jobhunter_token');
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  function login(token, userData) {
    localStorage.setItem('jobhunter_token', token);
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem('jobhunter_token');
    setUser(null);
  }

  if (loading) return <div className="app-loading">Loading...</div>;

  function Protected({ children }) {
    if (!user) return <Navigate to="/login" replace />;
    return children;
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <BrowserRouter>
        {user && <Navbar />}
        <main className={user ? 'main-with-nav' : ''}>
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
            <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <Register />} />
            <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
            <Route path="/tracker" element={<Protected><Tracker /></Protected>} />
            <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
            <Route path="/jobs/:id" element={<Protected><JobDetail /></Protected>} />
            <Route path="/search" element={<Protected><Search /></Protected>} />
            <Route path="/resumes" element={<Protected><Resumes /></Protected>} />
            <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
            <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
          </Routes>
        </main>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
