export interface TicketType {
  id: string;
  name: string;
  description: string | null;
  price: number;
  totalQuantity: number;
  availableQuantity: number;
  maxPerOrder: number;
  isSoldOut: boolean;
}

export interface Event {
  id: string;
  name: string;
  description: string | null;
  venue: string;
  eventDate: string;
  imageUrl: string | null;
  ticketTypes: TicketType[];
}

export interface HoldResponse {
  holdId: string;
  ticketTypeId: string;
  ticketTypeName: string;
  quantity: number;
  pricePerTicket: number;
  totalPrice: number;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface PaymentResponse {
  ticketId: string;
  ticketCode: string;
  customerName: string;
  customerEmail: string;
  quantity: number;
  totalAmount: number;
  message: string;
}

export interface HoldStatus {
  holdId: string;
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';
  quantity: number;
  expiresAt: string;
  secondsRemaining: number;
  isExpired: boolean;
  ticketType: {
    id: string;
    name: string;
    price: number;
  };
}

export interface AdminStats {
  totalTicketsSold: number;
  totalTransactions: number;
  totalRevenue: number;
  activeHolds: number;
  ticketTypes: {
    id: string;
    name: string;
    price: number;
    totalQuantity: number;
    availableQuantity: number;
    soldQuantity: number;
    holdQuantity: number;
  }[];
}

export interface TicketLookupResult {
  ticketCode: string;
  status: 'SOLD' | 'REFUNDED' | 'CANCELLED';
  customerName: string;
  customerEmail: string;
  quantity: number;
  totalAmount: number;
  purchasedAt: string;
  ticketTypeName: string;
  eventName: string;
  eventVenue: string;
  eventDate: string;
}

export interface ActiveHold {
  id: string;
  sessionId: string;
  ticketTypeName: string;
  eventName: string;
  quantity: number;
  expiresAt: string;
  secondsRemaining: number;
  createdAt: string;
}

export interface TicketCountUpdate {
  eventId: string;
  ticketCounts: {
    id: string;
    name: string;
    availableQuantity: number;
    totalQuantity: number;
    price: number;
  }[];
  timestamp: string;
}

export interface AddSlotsResponse {
  id: string;
  name: string;
  addedSlots: number;
  newTotalQuantity: number;
  newAvailableQuantity: number;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
