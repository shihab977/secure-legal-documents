import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useCrypto } from '../context/CryptoContext';
import { deriveMasterKeyAndAuthHash, decryptPrivateKey } from '../utils/cryptoEngine';
import { Lock, ShieldAlert, Cpu, LogOut, Key } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export default function KeyRestorationModal() {
  const { user, logout } = useAuth();
  const { setKeyMaterial } = useCrypto();
  const [password, setPassword] = useState('');
  const [statusStep, setStatusStep] = useState('');
  const [error, setError] = useState(null);
  const [unlocking, setUnlocking] = useState(false);

  const handleUnlockKeys = async (e) => {
    e.preventDefault();
    if (!password) return;

    setError(null);
    setUnlocking(true);

    try {
      setStatusStep('Deriving MasterKey via Argon2id WASM...');
      await new Promise(r => setTimeout(r, 80));

      // 1. Fetch user salt
      const saltRes = await axios.get(`${API_URL}/auth/salt?email=${encodeURIComponent(user.email)}`);
      const { userSalt } = saltRes.data;

      // 2. Derive MasterKey via Argon2id
      const { masterCryptoKey } = await deriveMasterKeyAndAuthHash(password, userSalt);

      setStatusStep('Decrypting RSA-2048 Private Key in memory...');
      await new Promise(r => setTimeout(r, 80));

      // 3. Decrypt user's encrypted private key
      const privateCryptoKey = await decryptPrivateKey(
        user.encryptedPrivateKey,
        user.privateKeyIV,
        masterCryptoKey
      );

      // 4. Restore keys in volatile React memory
      setKeyMaterial(masterCryptoKey, privateCryptoKey);
      setStatusStep('Cryptographic Keys Restored!');
    } catch (err) {
      console.error('[Key Restoration Error]', err);
      setError('Incorrect Master Password. Failed to decrypt in-memory keys.');
      setStatusStep('');
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(5, 8, 16, 0.85)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000
    }}>
      <div className="glass-card" style={{ maxWidth: '460px', width: '90%', padding: '32px', borderLeft: '4px solid #00f2fe' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'inline-flex', padding: '12px', background: 'rgba(0, 242, 254, 0.1)', borderRadius: '50%', marginBottom: '12px' }}>
            <Key size={32} color="#00f2fe" />
          </div>
          <h3 style={{ fontSize: '1.4rem', marginBottom: '6px' }} className="gradient-text">
            Unlock In-Memory Keys
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Session active for <strong style={{ color: '#fff' }}>{user?.email}</strong>. Re-enter Master Password to derive volatile encryption keys.
          </p>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#fca5a5',
            fontSize: '0.85rem',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <ShieldAlert size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleUnlockKeys}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Master Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <input
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

          {unlocking && statusStep && (
            <div style={{ padding: '10px', background: 'rgba(0, 242, 254, 0.08)', borderRadius: '8px', fontSize: '0.85rem', color: '#00f2fe', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu className="spin" size={16} />
              <span>{statusStep}</span>
            </div>
          )}

          <button type="submit" disabled={unlocking} className="btn-primary" style={{ width: '100%', padding: '12px', marginBottom: '12px' }}>
            {unlocking ? 'Deriving Keys...' : 'Restore Cryptographic Keys'}
          </button>

          <button
            type="button"
            onClick={logout}
            style={{
              width: '100%',
              padding: '10px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <LogOut size={14} /> Or Sign Out Account
          </button>
        </form>
      </div>
    </div>
  );
}
