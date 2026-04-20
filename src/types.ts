export interface UserProfile {
  uid: string;
  email: string;
  balance: number;
  referralBalance: number; // Commission that can be used for bets but not withdrawn
  isAdmin: boolean;
  status: 'active' | 'banned';
  createdAt: any;
  referralCode: string;
  referredBy?: string;
  referralEarnings: number;
}

export interface DepositRequest {
  id?: string;
  userId: string;
  userEmail?: string;
  amount: number;
  bonusAmount?: number;
  transactionId: string;
  proofUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: any;
}

export interface WithdrawalRequest {
  id?: string;
  userId: string;
  userEmail?: string;
  amount: number;
  upiId: string; // Keep for backward compatibility or simple use
  bankDetails?: {
    bankName: string;
    recipientName: string;
    accountNumber: string;
    phone: string;
    email: string;
    ifsc: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  timestamp: any;
}

export interface GameSettings {
  nextCrashValue: number;
  currentUpiId: string;
  currentQrCode: string;
  depositBonusPercentage: number;
  currentRound?: number;
  gameState?: 'waiting' | 'flying' | 'crashed';
  startTime?: any;
  countdownEndTime?: any;
  isManualMode?: boolean;
  lastFinalValue?: number;
  manualOverrideNextValue?: number;
}

export interface GameHistoryEntry {
  value: number;
  timestamp: any;
}
