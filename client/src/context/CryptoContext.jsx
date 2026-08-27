import React, { createContext, useContext, useState } from 'react';

const CryptoContext = createContext(null);

export const CryptoProvider = ({ children }) => {
  // In-memory strictly! Never saved to localStorage / sessionStorage
  const [masterKey, setMasterKey] = useState(null);
  const [privateKey, setPrivateKey] = useState(null);

  const setKeyMaterial = (masterCryptoKey, privateCryptoKey) => {
    setMasterKey(masterCryptoKey);
    setPrivateKey(privateCryptoKey);
  };

  const clearKeyMaterial = () => {
    setMasterKey(null);
    setPrivateKey(null);
  };

  return (
    <CryptoContext.Provider
      value={{
        masterKey,
        privateKey,
        hasKeysLoaded: Boolean(masterKey && privateKey),
        setKeyMaterial,
        clearKeyMaterial
      }}
    >
      {children}
    </CryptoContext.Provider>
  );
};

export const useCrypto = () => {
  const context = useContext(CryptoContext);
  if (!context) {
    throw new Error('useCrypto must be used within a CryptoProvider');
  }
  return context;
};
