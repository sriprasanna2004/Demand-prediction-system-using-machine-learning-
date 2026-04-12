import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

const GUEST = { name: "Guest", email: "" };

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
