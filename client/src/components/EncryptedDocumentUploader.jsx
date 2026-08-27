import React, { useState } from 'react';
import axios from 'axios';
import { generateDocumentDEK, encryptDocumentFile, wrapDEK } from '../utils/cryptoEngine';
import { ShieldCheck, Lock, UploadCloud, Cpu, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export default function EncryptedDocumentUploader({ caseData, onUploadSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [statusStep, setStatusStep] = useState('');
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    setError(null);
    setUploading(true);

    try {
      // 1. Read file into ArrayBuffer
      setStatusStep('Reading file payload into browser memory...');
      const fileBuffer = await selectedFile.arrayBuffer();

      // 2. Generate random 256-bit DEK & encrypt payload via AES-256-GCM
      setStatusStep('Generating random 256-bit DEK & 12-byte IV...');
      const dekKey = await generateDocumentDEK();

      setStatusStep('Encrypting document payload via AES-256-GCM in browser...');
      const { ciphertextBuffer, fileIVBase64 } = await encryptDocumentFile(fileBuffer, dekKey);

      // 3. Wrap DEK separately for each authorized case participant (Lawyer + Client)
      setStatusStep('Wrapping DEK via RSA-OAEP for authorized case participants...');
      const participants = [caseData.lawyerId, caseData.clientId];
      const accessList = [];

      for (const participant of participants) {
        const wrappedDEK = await wrapDEK(dekKey, participant.publicKey);
        accessList.push({
          userId: participant._id,
          wrappedDEK
        });
      }

      // 4. Construct FormData with ciphertext binary blob + metadata
      setStatusStep('Uploading ciphertext payload to MinIO object storage...');
      const formData = new FormData();
      const ciphertextBlob = new Blob([ciphertextBuffer], { type: 'application/octet-stream' });
      formData.append('file', ciphertextBlob, `${selectedFile.name}.enc`);

      formData.append('caseId', caseData._id);
      formData.append('originalFilename', selectedFile.name);
      formData.append('mimeType', selectedFile.type || 'application/octet-stream');
      formData.append('fileIV', fileIVBase64);
      formData.append('accessList', JSON.stringify(accessList));

      // 5. Submit to Backend Upload API
      await axios.post(`${API_URL}/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setStatusStep('Document encrypted & stored zero-knowledge successfully!');
      setSelectedFile(null);
      if (onUploadSuccess) onUploadSuccess();
    } catch (err) {
      console.error('[Document Upload Failure]', err);
      setError(err.response?.data?.error || err.message || 'Encrypted document upload failed.');
      setStatusStep('');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px', border: '1px dashed #00f2fe' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Lock color="#00f2fe" size={22} />
          <h4 style={{ fontSize: '1.1rem' }}>Zero-Knowledge Document Upload</h4>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 242, 254, 0.1)', color: '#00f2fe', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>
          <ShieldCheck size={14} /> Document encrypted locally before upload
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <form onSubmit={handleUpload}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
          <input
            type="file"
            onChange={handleFileChange}
            disabled={uploading}
            style={{ display: 'none' }}
            id="file-upload-input"
          />
          <label
            htmlFor="file-upload-input"
            style={{
              padding: '10px 16px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.85rem'
            }}
          >
            <UploadCloud size={18} color="#00f2fe" />
            {selectedFile ? selectedFile.name : 'Select Document (PDF, DOCX, TXT)...'}
          </label>

          {selectedFile && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              ({(selectedFile.size / 1024).toFixed(1)} KB)
            </span>
          )}
        </div>

        {uploading && statusStep && (
          <div style={{ padding: '10px', background: 'rgba(0, 242, 254, 0.08)', borderRadius: '8px', fontSize: '0.85rem', color: '#00f2fe', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu className="spin" size={16} />
            <span>{statusStep}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!selectedFile || uploading}
          className="btn-primary"
          style={{ width: '100%', padding: '10px', fontSize: '0.9rem', opacity: (!selectedFile || uploading) ? 0.6 : 1 }}
        >
          {uploading ? 'Encrypting & Uploading...' : 'Encrypt Locally & Store in MinIO'}
        </button>
      </form>
    </div>
  );
}
