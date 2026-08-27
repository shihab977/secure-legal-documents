import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useCrypto } from '../context/CryptoContext';
import DocumentList from '../components/DocumentList';
import { User, ShieldCheck, LogOut, CheckCircle2, FileText, Briefcase, ChevronDown, ChevronUp } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export default function ClientDashboard() {
  const { user, logout } = useAuth();
  const { hasKeysLoaded } = useCrypto();
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [expandedCaseId, setExpandedCaseId] = useState(null);

  useEffect(() => {
    fetchAssignedCases();
  }, []);

  const fetchAssignedCases = async () => {
    try {
      const res = await axios.get(`${API_URL}/cases`);
      setCases(res.data.cases || []);
    } catch (err) {
      console.error('Failed to fetch assigned cases', err);
    } finally {
      setLoadingCases(false);
    }
  };

  const toggleExpand = (caseId) => {
    setExpandedCaseId(expandedCaseId === caseId ? null : caseId);
  };

  return (
    <div style={{ maxWidth: '900px', margin: '30px auto', padding: '0 20px' }}>
      {/* Header Bar */}
      <header className="glass-card" style={{ padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <User size={28} color="#4facfe" />
          <div>
            <h2 style={{ fontSize: '1.4rem' }}>Client Portal</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Logged in as <strong style={{ color: '#fff' }}>{user?.name}</strong> ({user?.email})
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 600
          }}
        >
          <LogOut size={16} /> Logout
        </button>
      </header>

      {/* Security Context Status Card */}
      <div className="glass-card" style={{ padding: '20px 24px', marginBottom: '30px', borderLeft: '4px solid #4facfe' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ShieldCheck size={32} color="#10b981" />
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>Zero-Knowledge Client Key Material Active</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Your RSA-OAEP private key is held strictly in volatile browser memory to decrypt assigned legal documents.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.15)', padding: '6px 12px', borderRadius: '20px', color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>
            <CheckCircle2 size={16} /> Keys Ready
          </div>
        </div>
      </div>

      {/* Assigned Cases List */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.2rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Briefcase size={20} color="#4facfe" /> My Assigned Cases ({cases.length})
        </h3>

        {loadingCases ? (
          <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Loading assigned cases...</div>
        ) : cases.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
            <FileText size={40} color="#4facfe" style={{ marginBottom: '12px' }} />
            <p>No legal cases assigned to your account yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {cases.map(item => {
              const isExpanded = expandedCaseId === item._id;
              return (
                <div key={item._id} style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', cursor: 'pointer' }} onClick={() => toggleExpand(item._id)}>
                    <div>
                      <span style={{ fontSize: '0.75rem', background: 'rgba(79, 172, 254, 0.15)', color: '#4facfe', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
                        {item.caseNumber}
                      </span>
                      <h4 style={{ fontSize: '1.05rem', marginTop: '6px' }}>{item.title}</h4>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '10px', textTransform: 'capitalize' }}>
                        {item.status}
                      </span>
                      {isExpanded ? <ChevronUp size={18} color="#4facfe" /> : <ChevronDown size={18} color="#94a3b8" />}
                    </div>
                  </div>

                  {item.description && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '10px' }}>
                      {item.description}
                    </p>
                  )}

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: isExpanded ? '16px' : '0' }}>
                    <span>Assigned Attorney: <strong style={{ color: '#fff' }}>{item.lawyerId?.name}</strong> ({item.lawyerId?.email})</span>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                      <DocumentList caseId={item._id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
