import type {
  AuthenticatedUser,
  CreatedRequest,
  DepositFile,
  DepositView,
  InitUploadResponse,
  LinkAvailability,
  RequestDetail,
  RequestPage,
} from './types';

/**
 * Client HTTP de l'API.
 *
 * `credentials: 'include'` partout : l'authentification repose entierement sur
 * des cookies HttpOnly. Le front ne detient donc aucun jeton, ne le stocke
 * nulle part, et un XSS ne peut pas exfiltrer de session.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('Service indisponible. Verifiez votre connexion.', 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (payload as { message?: string } | null)?.message ?? 'Une erreur est survenue.';
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ user: AuthenticatedUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ user: AuthenticatedUser }>('/auth/me'),

  logout: () => request<{ status: string }>('/auth/logout', { method: 'POST' }),

  createRequest: (title: string, expiresInHours: number) =>
    request<CreatedRequest>('/requests', {
      method: 'POST',
      body: JSON.stringify({ title, expiresInHours }),
    }),

  listRequests: (page: number, pageSize = 10) =>
    request<RequestPage>(`/requests?page=${page}&pageSize=${pageSize}`),

  getRequest: (id: string) => request<RequestDetail>(`/requests/${id}`),

  downloadUrl: (id: string, fileId: string) =>
    request<{ url: string; expiresInSeconds: number }>(`/requests/${id}/files/${fileId}/url`),

  describeLink: (token: string) =>
    request<{ status: LinkAvailability }>(`/public/${encodeURIComponent(token)}`),

  unlock: (token: string, pin: string) =>
    request<DepositView>(`/public/${encodeURIComponent(token)}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  depositSession: (token: string) =>
    request<DepositView>(`/public/${encodeURIComponent(token)}/session`),

  initUpload: (token: string, filename: string, mimeType: string, size: number) =>
    request<InitUploadResponse>(`/public/${encodeURIComponent(token)}/files/init`, {
      method: 'POST',
      body: JSON.stringify({ filename, mimeType, size }),
    }),

  completeUpload: (token: string, fileId: string) =>
    request<{ file: DepositFile }>(`/public/${encodeURIComponent(token)}/files/complete`, {
      method: 'POST',
      body: JSON.stringify({ fileId }),
    }),
};

/**
 * Depot du binaire directement vers le stockage objet.
 *
 * XMLHttpRequest et non fetch : c'est la seule API navigateur qui expose la
 * progression d'un upload (`upload.onprogress`). Sans elle, la barre de
 * progression exigee par l'enonce serait une animation decorative.
 *
 * L'octet ne passe jamais par l'API NestJS : l'URL signee pointe sur Garage.
 */
export function uploadToStorage(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new ApiError('Le transfert vers le stockage a echoue.', xhr.status));
    };

    xhr.onerror = () => reject(new ApiError('Transfert interrompu.', 0));
    xhr.onabort = () => reject(new ApiError('Transfert annule.', 0));

    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(file);
  });
}
