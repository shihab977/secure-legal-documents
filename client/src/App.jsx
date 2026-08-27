import React, { useState } from 'react';
import { CryptoProvider, useCrypto } from './context/CryptoContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import LawyerDashboard from './pages/LawyerDashboard';
import ClientDashboard from './pages/ClientDashboard';
import KeyRestorationModal from './components/KeyRestorationModal';

function MainApp() {
  const { user, loading } = useAuth();
  const { hasKeysLoaded } = useCrypto();
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>
        Initializing Zero-Knowledge Workspace...
      </div>
    );
  }

  if (user) {
    return (
      <>
        {!hasKeysLoaded && <KeyRestorationModal />}
        {user.role === 'lawyer' ? <LawyerDashboard /> : <ClientDashboard />}
      </>
    );
  }

  return (
    <div style={{ paddingTop: '20px' }}>
      {authMode === 'login' ? (
        <Login onSwitchToRegister={() => setAuthMode('register')} />
      ) : (
        <Register onSwitchToLogin={() => setAuthMode('login')} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <CryptoProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </CryptoProvider>
  );
}
