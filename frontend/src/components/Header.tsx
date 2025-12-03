import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

interface HeaderProps {
  user: any;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <motion.header
      className="dashboard-header"
      initial={{ opacity: 0, y: -30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <motion.h1
        className="app-title"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <span className="logo-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="1.5" fill="none"/>
            <text x="12" y="16" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">?</text>
          </svg>
        </span>
        QuizMaster
      </motion.h1>
      <motion.nav
        className="header-nav"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <button className={`nav-link ${location.pathname === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>
          Dashboard
        </button>
        <button className={`nav-link ${location.pathname === '/editor' ? 'active' : ''}`} onClick={() => navigate('/editor')}>
          Create Quiz
        </button>
      </motion.nav>
      <motion.div
        className="user-info"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        <span className="welcome-text">Welcome, {user?.username}!</span>
        <button className="logout-btn" onClick={onLogout}>
          Logout
        </button>
      </motion.div>
    </motion.header>
  );
};
