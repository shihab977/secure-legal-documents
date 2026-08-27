import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useCrypto } from '../context/CryptoContext';
import EncryptedDocumentUploader from '../components/EncryptedDocumentUploader';
import DocumentList from '../components/DocumentList';
import { Briefcase, Key, Users, ShieldCheck, LogOut, CheckCircle2, Plus, FolderPlus, FileText, AlertCircle, X, ChevronDown, ChevronUp, Bell } from 'lucide-react';


const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export default function LawyerDashboard() {
  const { user, logout } = useAuth();
  const { hasKeysLoaded } = useCrypto();
  const [clients, setClients] = useState([]);
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    clientId: ''
  });
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchClients();
    fetchCases();
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const res = await axios.get(`${API_URL}/audit-logs/notifications`);
      setNotifications(res.data.notifications || []);
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await axios.get(`${API_URL}/users/clients`);
      setClients(res.data.clients || []);
      if (res.data.clients?.length > 0) {
        setFormData(prev => ({ ...prev, clientId: res.data.clients[0]._id }));
      }
    } catch (err) {
      console.error('Failed to fetch clients', err);
    }
  };

  const fetchCases = async () => {
    setLoadingCases(true);
    try {
      const res = await axios.get(`${API_URL}/cases`);
      setCases(res.data.cases || []);
    } catch (err) {
      console.error('Failed to fetch cases', err);
    } finally {
      setLoadingCases(false);
    }
  };

  const handleCreateCase = async (e) => {
    e.preventDefault();
    setError(null);
    setCreating(true);

    try {
      await axios.post(`${API_URL}/cases`, formData);
      setFormData({ title: '', description: '', clientId: clients[0]?._id || '' });
      setShowModal(false);
      fetchCases();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create case.');
    } finally {
      setCreating(false);
    }
  };

  const [expandedCaseId, setExpandedCaseId] = useState(null);
  const [docRefreshTrigger, setDocRefreshTrigger] = useState(0);

  const toggleExpand = (caseId) => {
    setExpandedCaseId(expandedCaseId === caseId ? null : caseId);
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '30px auto', padding: '0 20px' }}>
      {/* Header Bar */}
      <header className="glass-card" style={{ padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Briefcase size={28} color="#00f2fe" />
          <div>
            <h2 style={{ fontSize: '1.4rem' }}>Lawyer Workspace</h2>
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
      <div className="glass-card" style={{ padding: '20px 24px', marginBottom: '30px', borderLeft: '4px solid #00f2fe' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ShieldCheck size={32} color="#10b981" />
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>Browser Cryptographic Memory Isolated</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                MasterKey & RSA Private Key are active strictly in memory. Never saved to localStorage or sessionStorage.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.15)', padding: '6px 12px', borderRadius: '20px', color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>
            <CheckCircle2 size={16} /> Memory Active
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Active Cases Section */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Briefcase size={20} color="#00f2fe" /> Active Cases ({cases.length})
            </h3>
            <button
              onClick={() => setShowModal(true)}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.85rem' }}
            >
              <Plus size={16} /> New Case
            </button>
          </div>

          {loadingCases ? (
            <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Loading active legal cases...</div>
          ) : cases.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
              <FolderPlus size={36} color="#00f2fe" style={{ marginBottom: '10px' }} />
              <p>No active legal cases created yet.</p>
              <button
                onClick={() => setShowModal(true)}
                style={{ background: 'none', border: 'none', color: '#00f2fe', cursor: 'pointer', textDecoration: 'underline', marginTop: '8px' }}
              >
                Create your first case
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {cases.map(item => {
                const isExpanded = expandedCaseId === item._id;
                return (
                  <div key={item._id} style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', cursor: 'pointer' }} onClick={() => toggleExpand(item._id)}>
                      <div>
                        <span style={{ fontSize: '0.75rem', background: 'rgba(0, 242, 254, 0.15)', color: '#00f2fe', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
                          {item.caseNumber}
                        </span>
                        <h4 style={{ fontSize: '1.05rem', marginTop: '6px' }}>{item.title}</h4>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.75rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '10px', textTransform: 'capitalize' }}>
                          {item.status}
                        </span>
                        {isExpanded ? <ChevronUp size={18} color="#00f2fe" /> : <ChevronDown size={18} color="#94a3b8" />}
                      </div>
                    </div>

                    {item.description && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '10px' }}>
                        {item.description}
                      </p>
                    )}

                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: isExpanded ? '16px' : '0' }}>
                      <span>Client: <strong style={{ color: '#fff' }}>{item.clientId?.name || 'Unassigned'}</strong></span>
                      <span>Created: {new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                        <EncryptedDocumentUploader
                          caseData={item}
                          onUploadSuccess={() => setDocRefreshTrigger(prev => prev + 1)}
                        />
                        <DocumentList
                          caseId={item._id}
                          refreshTrigger={docRefreshTrigger}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>


        {/* Sidebar Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Document Access Notifications Card */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={18} color="#00f2fe" /> Document Access Notifications
            </h3>

            {loadingNotifications ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading access notifications...</div>
            ) : notifications.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No client access notifications recorded yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto' }}>
                {notifications.map(notif => (
                  <div key={notif.id} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: notif.action === 'VIEWED' ? 'rgba(0, 242, 254, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: notif.action === 'VIEWED' ? '#00f2fe' : '#10b981'
                      }}>
                        {notif.action}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{notif.clientName}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{notif.clientEmail}</div>
                    <div style={{ fontSize: '0.75rem', color: '#fff', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <FileText size={12} color="#00f2fe" /> {notif.documentFilename}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Case ID: {notif.caseId}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Registered Clients Sidebar */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} color="#4facfe" /> Registered Clients
            </h3>

            {clients.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No registered clients found. Have client register first.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {clients.map(client => (
                  <div key={client._id} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{client.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{client.email}</div>
                    <div style={{ fontSize: '0.75rem', color: '#00f2fe', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Key size={12} /> RSA-2048 Public Key Ready
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Case Modal */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px', padding: '30px', position: 'relative' }}>
            <button
              onClick={() => setShowModal(false)}
              style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '1.4rem', marginBottom: '6px' }} className="gradient-text">Create Legal Case</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Define case metadata and assign an authorized client to the Access Control List (ACL).
            </p>

            {error && (
              <div style={{ padding: '10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '16px' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleCreateCase}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Case Title
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Intellectual Property Defense v. Acme Corp"
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: '#fff',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Assign Authorized Client
                </label>
                <select
                  required
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#121826',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: '#fff',
                    outline: 'none'
                  }}
                >
                  {clients.length === 0 && <option value="">No registered clients available</option>}
                  {clients.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Case Description
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Summary of legal proceeding and compliance requirements..."
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: '#fff',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>

              <button type="submit" disabled={creating || clients.length === 0} className="btn-primary" style={{ width: '100%', padding: '12px' }}>
                {creating ? 'Creating Case...' : 'Create Case & Set ACL'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
