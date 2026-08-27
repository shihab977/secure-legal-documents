import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useCrypto } from './CryptoContext';
import {
  generateUserSalt,
  deriveMasterKeyAndAuthHash,
  generateRSAKeyPair,
  encryptPrivateKey,
  decryptPrivateKey
} from '../utils/cryptoEngine';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('vault_jwt') || null);
  const [loading, setLoading] = useState(true);
  const { setKeyMaterial, clearKeyMaterial } = useCrypto();

  // Set axios default auth header
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchCurrentUser();
    } else {
      delete axios.defaults.headers.common['Authorization'];
      setLoading(false);
    }
  }, [token]);

  const fetchCurrentUser = async () => {
    try {
      const res = await axios.get(`${API_URL}/auth/me`);
      setUser(res.data.user);
    } catch (err) {
      logout();
    } finally {
      setLoading(false);
    }
  };

  /**
   * Client-Side Zero-Knowledge Registration
   */
  const register = async ({ name, email, password, role }) => {
    // 1. Generate random salt on client
    const userSalt = generateUserSalt();

    // 2. Derive MasterKey & AuthHash via Argon2id
    const { masterCryptoKey, authHash } = await deriveMasterKeyAndAuthHash(password, userSalt);

    // 3. Generate RSA-OAEP 2048 key pair
    const { publicKeyString, privateKeyJwk, privateKeyObject } = await generateRSAKeyPair();

    // 4. Encrypt private key using MasterKey (AES-256-GCM)
    const { encryptedPrivateKey, privateKeyIV } = await encryptPrivateKey(privateKeyJwk, masterCryptoKey);

    // 5. Transmit payload to server (Strictly NO password, NO MasterKey, NO plaintext private key)
    const payload = {
      name,
      email,
      role,
      authHash,
      userSalt,
      publicKey: publicKeyString,
      encryptedPrivateKey,
      privateKeyIV
    };

    const res = await axios.post(`${API_URL}/auth/register`, payload);

    // 6. Save session & store keys in memory
    const newToken = res.data.token;
    localStorage.setItem('vault_jwt', newToken);
    setToken(newToken);
    setUser(res.data.user);

    setKeyMaterial(masterCryptoKey, privateKeyObject);

    return res.data;
  };

  /**
   * Client-Side Zero-Knowledge Login
   */
  const login = async ({ email, password }) => {
    // 1. Fetch user salt from server
    const saltRes = await axios.get(`${API_URL}/auth/salt?email=${encodeURIComponent(email)}`);
    const { userSalt } = saltRes.data;

    // 2. Derive MasterKey & AuthHash via Argon2id
    const { masterCryptoKey, authHash } = await deriveMasterKeyAndAuthHash(password, userSalt);

    // 3. Authenticate with AuthHash
    const res = await axios.post(`${API_URL}/auth/login`, {
      email,
      authHash
    });

    const userData = res.data.user;
    const newToken = res.data.token;

    // 4. Decrypt user's RSA private key in memory using MasterKey
    const privateCryptoKey = await decryptPrivateKey(
      userData.encryptedPrivateKey,
      userData.privateKeyIV,
      masterCryptoKey
    );

    // 5. Save session & store keys in memory ONLY
    localStorage.setItem('vault_jwt', newToken);
    setToken(newToken);
    setUser(userData);

    setKeyMaterial(masterCryptoKey, privateCryptoKey);

    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('vault_jwt');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    clearKeyMaterial();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        register,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
