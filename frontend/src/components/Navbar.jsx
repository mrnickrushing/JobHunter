
import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import styles from './Navbar.module.css';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  function handleLogout() { logout(); navigate('/login'); }
  function toggleMenu() { setMenuOpen(prev => !prev); }
  function closeMenu() { setMenuOpen(false); }

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/tracker', label: 'Tracker' },
    { to: '/search', label: 'Search' },
    { to: '/resumes', label: 'Resumes' },
    { to: '/analytics', label: 'Analytics' },
  ];

  return (
    <nav className={styles.navbar}>
      <div className={styles.container}>
        <NavLink to="/dashboard" className={styles.logo} onClick={closeMenu}>
          <span className={styles.logoIcon}>JH</span>
          <span className={styles.logoText}>JobHunter</span>
        </NavLink>
        <div className={styles.links}>
          {navLinks.map(link => (
            <NavLink key={link.to} to={link.to} className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ''}`}>
              {link.label}
            </NavLink>
          ))}
        </div>
        <div className={styles.userArea}>
          {user && (
            <>
              <button className={styles.themeToggle} onClick={() => setDarkMode(v => !v)} aria-label="Toggle dark mode">
                {darkMode ? '☀️' : '🌙'}
              </button>
              <span className={styles.userName}>{user.name || user.email}</span>
              <button className={styles.logoutBtn} onClick={handleLogout}>Log out</button>
            </>
          )}
        </div>
        <button className={styles.hamburger} onClick={toggleMenu} aria-label="Toggle menu" aria-expanded={menuOpen}>
          <span className={`${styles.bar} ${menuOpen ? styles.barOpen1 : ''}`} />
          <span className={`${styles.bar} ${menuOpen ? styles.barOpen2 : ''}`} />
          <span className={`${styles.bar} ${menuOpen ? styles.barOpen3 : ''}`} />
        </button>
      </div>
      {menuOpen && (
        <div className={styles.mobileMenu}>
          {navLinks.map(link => (
            <NavLink key={link.to} to={link.to}
              className={({ isActive }) => `${styles.mobileLink} ${isActive ? styles.mobileLinkActive : ''}`}
              onClick={closeMenu}>
              {link.label}
            </NavLink>
          ))}
          <div className={styles.mobileDivider} />
          {user && (
            <>
              <button className={styles.themeToggle} onClick={() => setDarkMode(v => !v)} aria-label="Toggle dark mode">
                {darkMode ? '☀️ Light mode' : '🌙 Dark mode'}
              </button>
              <span className={styles.mobileUser}>{user.name || user.email}</span>
              <button className={styles.mobileLogout} onClick={() => { closeMenu(); handleLogout(); }}>Log out</button>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
