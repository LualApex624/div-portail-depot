export type RequestStatus = 'PENDING' | 'COMPLETE' | 'EXPIRED' | 'LOCKED';
export type FileStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type LinkAvailability = 'AVAILABLE' | 'LOCKED' | 'UNAVAILABLE';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}

export interface RequestSummary {
  id: string;
  title: string;
  status: RequestStatus;
  expiresAt: string;
  createdAt: string;
  fileCount: number;
  acceptedCount: number;
}

export interface RequestPage {
  items: RequestSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreatedRequest {
  id: string;
  title: string;
  url: string;
  pin: string;
  expiresAt: string;
}

export interface DepositFile {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  status: FileStatus;
  rejectionReason: string | null;
}

export interface RequestDetail {
  id: string;
  title: string;
  status: RequestStatus;
  expiresAt: string;
  createdAt: string;
  purgedAt: string | null;
  files: Array<DepositFile & { createdAt: string; completedAt: string | null }>;
}

export interface DepositView {
  title: string;
  expiresAt: string;
  status: RequestStatus;
  maxFileSizeBytes: number;
  maxFiles: number;
  allowedMimeTypes: string[];
  files: DepositFile[];
}

export interface InitUploadResponse {
  fileId: string;
  uploadUrl: string;
  expiresInSeconds: number;
}
