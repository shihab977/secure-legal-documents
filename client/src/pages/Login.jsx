import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Mail, Lock, Key, AlertCircle, Cpu } from 'lucide-react';

export default function Login({ onSwitchToRegister }) {
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [statusStep, setStatusStep] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      setStatusStep('Fetching User Salt...');
      await new Promise(r => setTimeout(r, 100));

      setStatusStep('Deriving MasterKey & AuthHash via Argon2id WASM...');
      await new Promise(r => setTimeout(r, 100));

      setStatusStep('Authenticating & Decrypting RSA Private Key in Memory...');
      await login(formData);

      setStatusStep('Login Successful!');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Authentication failed.');
      setStatusStep('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card" style={{ maxWidth: '440px', margin: '40px auto', padding: '36px' }}>
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <Shield size={40} color="#00f2fe" style={{ marginBottom: '12px' }} />
        <h2 style={{ fontSize: '1.8rem' }} className="gradient-text">Welcome Back</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '6px' }}>
          Zero-Knowledge Authentication & Memory Decryption
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
            Email Address
          </label>
          <div style={{ position: 'relative' }}>
            <Mail size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="user@domain.com"
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
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
            Master Password
          </label>
          <div style={{ position: 'relative' }}>
            <Lock size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input
              type="password"
              required
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
          {loading ? 'Authenticating...' : 'Sign In & Decrypt Keys'}
        </button>
      </form>

      <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
        Don't have an account?{' '}
        <button
          onClick={onSwitchToRegister}
          style={{ background: 'none', border: 'none', color: '#00f2fe', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Create One
        </button>
      </div>
    </div>
  );
}
