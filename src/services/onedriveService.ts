/**
 * Serviço para interagir com a API do OneDrive via Backend
 */

export interface OneDriveUser {
  displayName: string;
  mail?: string;
  userPrincipalName: string;
}

export interface DriveItem {
  id: string;
  name: string;
  folder?: any;
  file?: any;
  webUrl: string;
  size: number;
}

// Wrapper para requisições de API com cabeçalhos de autenticação e persistência robusta
async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = { ...(options.headers || {}) } as Record<string, string>;
  
  const token = localStorage.getItem('onedrive_token');
  const refreshToken = localStorage.getItem('onedrive_refresh_token');

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (refreshToken) {
    headers['X-OneDrive-Refresh-Token'] = refreshToken;
  }

  const response = await fetch(url, { ...options, headers });

  // Se o servidor emitiu tokens renovados em resposta à expiração, guardamos automaticamente
  const newAccessToken = response.headers.get('x-new-access-token');
  const newRefreshToken = response.headers.get('x-new-refresh-token');

  if (newAccessToken) {
    localStorage.setItem('onedrive_token', newAccessToken);
  }
  if (newRefreshToken) {
    localStorage.setItem('onedrive_refresh_token', newRefreshToken);
  }

  return response;
}

export const onedriveService = {
  async getAuthUrl(): Promise<string> {
    const res = await apiFetch('/api/auth/onedrive/url');
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao obter URL de autorização do OneDrive.');
    }
    return data.url;
  },

  async getUser(): Promise<OneDriveUser | null> {
    try {
      const res = await apiFetch('/api/onedrive/me');
      if (!res.ok) {
        // Se as duas tentativas falharem, limpamos credenciais inválidas locais
        if (res.status === 401) {
          localStorage.removeItem('onedrive_token');
          localStorage.removeItem('onedrive_refresh_token');
        }
        return null;
      }
      return await res.json();
    } catch {
      return null;
    }
  },

  async getDiagnostics(): Promise<any> {
    const res = await apiFetch('/api/auth/onedrive/diagnostics');
    if (!res.ok) throw new Error('Falha ao obter diagnóstico de sincronização do OneDrive.');
    return await res.json();
  },

  async listFiles(folderId?: string): Promise<DriveItem[]> {
    const url = folderId ? `/api/onedrive/files?folderId=${folderId}` : '/api/onedrive/files';
    const res = await apiFetch(url);
    if (!res.ok) throw new Error('Falha ao listar arquivos do OneDrive.');
    const data = await res.json();
    return data.value || [];
  },

  // Obtém um link de visualização direta do PDF
  async getPreviewUrl(itemId: string): Promise<string> {
    return `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/preview`;
  }
};
