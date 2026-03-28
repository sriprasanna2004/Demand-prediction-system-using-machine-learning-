import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

// Socket.io needs the actual backend URL (can't use relative)
const SOCKET_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:4000'
  : 'https://divine-surprise-production-1666.up.railway.app';

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [dashboardUpdate, setDashboardUpdate] = useState(null);

  useEffect(() => {
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    });

    socketRef.current.on('connect', () => setConnected(true));
    socketRef.current.on('disconnect', () => setConnected(false));
    socketRef.current.on('new_sale', (sale) => setLastSale(sale));
    socketRef.current.on('dashboard_update', (data) => setDashboardUpdate(data));

    return () => socketRef.current?.disconnect();
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, lastSale, dashboardUpdate }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
