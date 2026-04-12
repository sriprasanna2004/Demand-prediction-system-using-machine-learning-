import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

// Auth is bypassed — app is open access (no login required)
const GUEST = { name: 'Guest', email: '' };

export function AuthProvider({ children }) {
  const [user] = useState(GUEST);
  const logout = () => {};

  return (
    <AuthContext.Provider value={{ user, token: null, loading: false, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export const useAuth = () => useContext(AuthContext);
