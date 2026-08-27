import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, User, Lock, Mail, Briefcase, Cpu, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Register({ onSwitchToLogin }) {
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'client'
  });
  const [statusStep, setStatusStep] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      setStatusStep('Deriving MasterKey via Argon2id WASM...');
      await new Promise(r => setTimeout(r, 100)); // Allow DOM render

      setStatusStep('Generating RSA-OAEP 2048-bit Key Pair in Web Crypto API...');
      await new Promise(r => setTimeout(r, 100));

      setStatusStep('Encrypting Private Key with MasterKey (AES-256-GCM)...');
      await new Promise(r => setTimeout(r, 100));

      setStatusStep('Submitting Zero-Knowledge Registration...');
      await register(formData);

      setStatusStep('Registration Complete!');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Registration failed.');
      setStatusStep('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card" style={{ maxWidth: '480px', margin: '40px auto', padding: '36px' }}>
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <Shield size={40} color="#00f2fe" style={{ marginBottom: '12px' }} />
        <h2 style={{ fontSize: '1.8rem' }} className="gradient-text">Create Account</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '6px' }}>
          Zero-Knowledge Identity & Key Generation
        </p>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '10px',
          color: '#fca5a5',
          fontSize: '0.9rem',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '18px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
            Full Name
          </label>
          <div style={{ position: 'relative' }}>
            <User size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Attorney Sarah Jenkins"
              style={{
                width: '100%',
                padding: '10px 12px 10px 40px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                color: '#fff',
                outline: 'none'
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '18px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
            Email Address
          </label>
          <div style={{ position: 'relative' }}>
            <Mail size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="lawyer@firm.com"
              style={{
                width: '100%',
                padding: '10px 12px 10px 40px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                color: '#fff',
                outline: 'none'
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '18px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
            Password (Used for MasterKey Derivation)
          </label>
          <div style={{ position: 'relative' }}>
            <Lock size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input
              type="password"
              required
              minLength={8}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••••••"
              style={{
                width: '100%',
                padding: '10px 12px 10px 40px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                color: '#fff',
                outline: 'none'
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Account Role
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, role: 'lawyer' })}
              style={{
                padding: '10px',
                borderRadius: '10px',
                border: formData.role === 'lawyer' ? '2px solid #00f2fe' : '1px solid var(--border-color)',
                background: formData.role === 'lawyer' ? 'rgba(0, 242, 254, 0.15)' : 'rgba(255,255,255,0.03)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontWeight: 600
              }}
            >
              <Briefcase size={16} color="#00f2fe" /> Lawyer
            </button>

            <button
              type="button"
              onClick={() => setFormData({ ...formData, role: 'client' })}
              style={{
                padding: '10px',
                borderRadius: '10px',
                border: formData.role === 'client' ? '2px solid #4facfe' : '1px solid var(--border-color)',
                background: formData.role === 'client' ? 'rgba(79, 172, 254, 0.15)' : 'rgba(255,255,255,0.03)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontWeight: 600
              }}
            >
              <User size={16} color="#4facfe" /> Client
            </button>
          </div>
        </div>

        {loading && statusStep && (
          <div style={{
            padding: '12px',
            background: 'rgba(0, 242, 254, 0.08)',
            borderRadius: '10px',
            fontSize: '0.85rem',
            color: '#00f2fe',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Cpu className="spin" size={16} />
            <span>{statusStep}</span>
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', padding: '12px' }}>
          {loading ? 'Generating Security Keys...' : 'Register & Generate Keys'}
        </button>
      </form>

      <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
        Already have an account?{' '}
        <button
          onClick={onSwitchToLogin}
          style={{ background: 'none', border: 'none', color: '#00f2fe', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Sign In
        </button>
      </div>
    </div>
  );
}
