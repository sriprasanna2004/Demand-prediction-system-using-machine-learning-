import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [dashboardUpdate, setDashboardUpdate] = useState(null);

  useEffect(() => {
    socketRef.current = io(API_URL, { transports: ['websocket'] });

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
