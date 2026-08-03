import { io, Socket } from "socket.io-client";
import { API_ROOT } from "@/lib/api";

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || API_ROOT).replace(/\/$/, "");

let socket: Socket | null = null;

export const socketService = {
  /**
   * Initialize socket connection
   */
  connect: (userId: string) => {
    if (socket?.connected) {
      return socket;
    }

    socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ["websocket", "polling"]
    });

    socket.on("connect", () => {
      console.log("Socket connected:", socket?.id);
      // Notify server of user connection
      if (socket && userId) {
        socket.emit("userConnected", userId);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected");
    });

    return socket;
  },

  /**
   * Disconnect socket
   */
  disconnect: () => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  },

  /**
   * Get current socket instance
   */
  getSocket: () => socket,

  /**
   * Emit SOS alert through WebSocket
   */
  triggerSOSAlert: (sosData: {
    userId: string;
    latitude: number;
    longitude: number;
    address: string;
    accuracy: number;
  }) => {
    if (!socket?.connected) {
      console.error("Socket not connected");
      return;
    }
    socket.emit("sosTriggered", sosData);
  },

  /**
   * Listen for SOS acknowledgment from server
   */
  onSOSAcknowledged: (callback: (data: any) => void) => {
    if (socket) {
      socket.on("sosAcknowledged", callback);
    }
  },

  /**
   * Listen for SOS errors
   */
  onSOSError: (callback: (data: any) => void) => {
    if (socket) {
      socket.on("sosError", callback);
    }
  },

  /**
   * Notify emergency contacts through WebSocket
   */
  notifyEmergencyContacts: (notificationData: {
    sosId: string;
    userId: string;
    locationLink: string;
  }) => {
    if (!socket?.connected) {
      console.error("Socket not connected");
      return;
    }
    socket.emit("notifyEmergencyContacts", notificationData);
  },

  /**
   * Listen for emergency contacts notified confirmation
   */
  onContactsNotified: (callback: (data: any) => void) => {
    if (socket) {
      socket.on("contactsNotified", callback);
    }
  },

  /**
   * Send location updates with detailed data
   */
  sendLocation: (userId: string, latitude: number, longitude: number, address?: string, accuracy?: number) => {
    if (!socket?.connected) {
      console.error("Socket not connected");
      return;
    }
    socket.emit("sendLocation", {
      userId,
      lat: latitude,
      lng: longitude,
      address: address || "Location updated",
      accuracy: accuracy || null,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Listen for location updates from other users
   */
  onLocationUpdate: (callback: (data: any) => void) => {
    if (socket) {
      socket.on("locationUpdate", callback);
    }
  }
};
