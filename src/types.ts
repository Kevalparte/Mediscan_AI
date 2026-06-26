export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface ScanResult {
  medicineName: string;
  purpose: string;
  dosage: string;
  sideEffects: string;
  precautions: string;
  isSafe: boolean;
  severity: "safe" | "caution" | "dangerous";
  rawText?: string;
  scannedAt?: string;
  medicines?: Array<{
    name: string;
    purpose: string;
    dosage: string;
    sideEffects: string;
    precautions: string;
    severity?: "safe" | "caution" | "dangerous";
  }>;
}

export interface ScanHistory {
  id: string;
  userId: string;
  imageUrl?: string;
  scanResult: ScanResult;
  scannedAt: string;
}

export interface Reminder {
  id: string;
  userId: string;
  medicineName: string;
  dosage: string;
  time: string; // "08:00" format
  frequency: "Daily" | "Twice daily" | "Three times daily" | "Weekly" | "As needed";
  days: string; // e.g. "Mon, Wed, Fri"
  isActive: boolean;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp: string;
}

export interface DrugInteractionResult {
  severity: "safe" | "caution" | "dangerous";
  explanation: string;
  medicines: string[];
}
