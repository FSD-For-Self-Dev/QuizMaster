import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import './PublicHeader.css';

export const PublicHeader: React.FC = () => {
  const navigate = useNavigate();

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
        onClick={() => navigate('/')}
      >
        <span className="logo-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="1.5" fill="none"/>
            <text x="12" y="16" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">?</text>
          </svg>
        </span>
        QuizMaster
      </motion.h1>
    </motion.header>
  );
};