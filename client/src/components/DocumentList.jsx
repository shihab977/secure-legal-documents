import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useCrypto } from '../context/CryptoContext';
import { unwrapDEK, decryptDocumentFile } from '../utils/cryptoEngine';
import { FileText, Lock, ShieldCheck, Download, Eye, Cpu, AlertCircle, X, CheckCircle2, ShieldAlert } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export default function DocumentList({ caseId, refreshTrigger }) {
  const { privateKey, hasKeysLoaded } = useCrypto();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Decryption state management
  const [activeDecryptionId, setActiveDecryptionId] = useState(null);
  const [decryptionStep, setDecryptionStep] = useState('');
  const [errorMap, setErrorMap] = useState({});

  // Document Preview Modal state
  const [previewDoc, setPreviewDoc] = useState(null); // { filename, mimeType, objectUrl }

  useEffect(() => {
    fetchDocuments();
  }, [caseId, refreshTrigger]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/documents/case/${caseId}`);
      setDocuments(res.data.documents || []);
    } catch (err) {
      console.error('Failed to fetch documents', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Client-Side Zero-Knowledge Document Retrieval & Decryption Pipeline
   */
  const processDocumentDecryption = async (docId, mode = 'download') => {
    if (!hasKeysLoaded || !privateKey) {
      setErrorMap(prev => ({
        ...prev,
        [docId]: 'Secure key material is not available in this browser session. Please sign in or unlock your Master Password to continue.'
      }));
      return;
    }

    setErrorMap(prev => ({ ...prev, [docId]: null }));
    setActiveDecryptionId(docId);

    try {
      // 1. Fetch document metadata & user-specific wrapped DEK
      setDecryptionStep('Retrieving encrypted document metadata...');
      const metaRes = await axios.get(`${API_URL}/documents/${docId}`);
      const { document: docMeta, wrappedDEK } = metaRes.data;

      // 2. Fetch raw ciphertext binary ArrayBuffer from MinIO via backend
      setDecryptionStep('Retrieving encrypted document ciphertext payload...');
      const ciphertextRes = await axios.get(`${API_URL}/documents/${docId}/ciphertext`, {
        params: { action: mode },
        responseType: 'arraybuffer'
      });
      const ciphertextArrayBuffer = ciphertextRes.data;

      // 3. Unwrap DEK using RSA-OAEP 2048 Private Key from volatile browser memory
      setDecryptionStep('Unwrapping document key locally via RSA-OAEP in browser memory...');
      await new Promise(r => setTimeout(r, 60)); // Small yield for UI updates
      const dekCryptoKey = await unwrapDEK(wrappedDEK, privateKey);

      // 4. Decrypt document payload using AES-256-GCM + IV in browser memory
      setDecryptionStep('Decrypting document payload locally via AES-256-GCM...');
      await new Promise(r => setTimeout(r, 60));
      const decryptedArrayBuffer = await decryptDocumentFile(
        ciphertextArrayBuffer,
        docMeta.fileIV,
        dekCryptoKey
      );

      setDecryptionStep('Document ready.');

      // 5. Construct browser Blob object
      const blob = new Blob([decryptedArrayBuffer], { type: docMeta.mimeType || 'application/octet-stream' });
      const objectUrl = URL.createObjectURL(blob);

      if (mode === 'view') {
        setPreviewDoc({
          filename: docMeta.originalFilename,
          mimeType: docMeta.mimeType,
          objectUrl
        });
      } else {
        // Trigger client-side file download
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = docMeta.originalFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Revoke Object URL after download
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    } catch (err) {
      console.error('[Document Decryption Error]', err);
      let userMsg = 'Unable to decrypt this document. The document payload may be corrupted or you may not have the required key material.';
      if (err.name === 'OperationError') {
        userMsg = 'AES-256-GCM authentication failure: Ciphertext may have been tampered with or modified.';
      }
      setErrorMap(prev => ({ ...prev, [docId]: userMsg }));
    } finally {
      setActiveDecryptionId(null);
      setDecryptionStep('');
    }
  };

  const closePreviewModal = () => {
    if (previewDoc && previewDoc.objectUrl) {
      URL.revokeObjectURL(previewDoc.objectUrl);
    }
    setPreviewDoc(null);
  };

  return (
    <div style={{ marginTop: '20px' }}>
      <h4 style={{ fontSize: '1.1rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FileText size={18} color="#00f2fe" /> Encrypted Document Repository ({documents.length})
      </h4>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading document metadata...</div>
      ) : documents.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '10px' }}>
          No encrypted documents uploaded for this case yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {documents.map(doc => {
            const isProcessing = activeDecryptionId === doc._id;
            const err = errorMap[doc._id];
            const isPdf = doc.mimeType?.includes('pdf') || doc.originalFilename?.toLowerCase().endsWith('.pdf');
            const isImage = doc.mimeType?.startsWith('image/') || /\.(png|jpg|jpeg|svg)$/i.test(doc.originalFilename);
            const isTxt = doc.mimeType?.includes('text') || doc.originalFilename?.toLowerCase().endsWith('.txt');
            const canPreview = isPdf || isImage || isTxt;

            return (
              <div key={doc._id} style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Lock size={15} color="#00f2fe" />
                      {doc.originalFilename}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px', display: 'flex', gap: '14px' }}>
                      <span>Size: <strong style={{ color: '#aaa' }}>{(doc.fileSize / 1024).toFixed(1)} KB</strong></span>
                      <span>Uploader: {doc.uploadedBy?.name || 'Authorized User'}</span>
                      <span>Uploaded: {new Date(doc.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {canPreview && (
                      <button
                        onClick={() => processDocumentDecryption(doc._id, 'view')}
                        disabled={isProcessing}
                        className="btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.8rem' }}
                      >
                        <Eye size={14} color="#00f2fe" /> View
                      </button>
                    )}

                    <button
                      onClick={() => processDocumentDecryption(doc._id, 'download')}
                      disabled={isProcessing}
                      className="btn-primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '0.8rem' }}
                    >
                      <Download size={14} /> Download
                    </button>
                  </div>
                </div>

                {isProcessing && (
                  <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(0, 242, 254, 0.08)', borderRadius: '8px', fontSize: '0.85rem', color: '#00f2fe', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Cpu className="spin" size={16} />
                    <span>{decryptionStep}</span>
                  </div>
                )}

                {err && (
                  <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={16} /> {err}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* In-Browser Document Preview Modal */}
      {previewDoc && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(5, 8, 16, 0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 3000
        }}>
          <div className="glass-card" style={{ maxWidth: '900px', width: '95%', height: '85vh', padding: '24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={20} color="#00f2fe" /> {previewDoc.filename}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                  <ShieldCheck size={14} /> Document is decrypted locally in your browser.
                </span>
              </div>

              <button
                onClick={closePreviewModal}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ flex: 1, background: '#0f172a', borderRadius: '8px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {previewDoc.mimeType?.includes('pdf') || previewDoc.filename.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewDoc.objectUrl}
                  title={previewDoc.filename}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              ) : previewDoc.mimeType?.startsWith('image/') || /\.(png|jpg|jpeg|svg)$/i.test(previewDoc.filename) ? (
                <img
                  src={previewDoc.objectUrl}
                  alt={previewDoc.filename}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              ) : (
                <iframe
                  src={previewDoc.objectUrl}
                  title={previewDoc.filename}
                  style={{ width: '100%', height: '100%', border: 'none', color: '#fff', background: '#0f172a' }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
