/**
 * Serviço para interagir com a API do OneDrive via Backend ou diretamente via Cliente-Side
 */
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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

export interface OneDriveConfig {
  clientId: string;
  clientSecret?: string;
}

export async function getOneDriveConfig(): Promise<OneDriveConfig | null> {
  // 1. Tenta carregar do Firestore primeiro (útil para Vercel sem backend)
  try {
    const configDoc = await getDoc(doc(db, 'config', 'onedrive'));
    if (configDoc.exists()) {
      const data = configDoc.data();
      if (data.clientId) {
        return {
          clientId: data.clientId.trim(),
          clientSecret: data.clientSecret ? data.clientSecret.trim() : undefined,
        };
      }
    }
  } catch (err) {
    console.warn("Erro ao buscar configurações no Firestore:", err);
  }

  // 2. Fallback para variáveis de ambiente VITE se injetadas
  const metaEnv = (import.meta as any).env || {};
  const envId = (metaEnv.VITE_ONEDRIVE_CLIENT_ID || '').trim();
  const envSecret = (metaEnv.VITE_ONEDRIVE_CLIENT_SECRET || '').trim();

  if (envId) {
    return {
      clientId: envId,
      clientSecret: envSecret || undefined
    };
  }

  return null;
}

export async function saveOneDriveConfig(config: OneDriveConfig): Promise<void> {
  await setDoc(doc(db, 'config', 'onedrive'), {
    clientId: config.clientId.trim(),
    clientSecret: config.clientSecret ? config.clientSecret.trim() : '',
    updatedAt: new Date().toISOString()
  });
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

  // Se o backend principal não estiver de pé ou se estivermos rodando no cliente diretamente,
  // direcionamos a requisição DIRETAMENTE para a API do Microsoft Graph.
  let finalUrl = url;
  const isVercel = window.location.hostname.includes('vercel.app');

  if (isVercel) {
    if (url === '/api/onedrive/me') {
      finalUrl = 'https://graph.microsoft.com/v1.0/me';
    } else if (url.startsWith('/api/onedrive/files')) {
      const parts = url.split('?');
      const searchParams = new URLSearchParams(parts[1] || '');
      const folderId = searchParams.get('folderId');
      finalUrl = folderId 
        ? `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`
        : `https://graph.microsoft.com/v1.0/me/drive/root/children`;
    }
  }

  let response: Response;
  try {
    response = await fetch(finalUrl, { ...options, headers });
  } catch (err) {
    // Se falhar na URL local, tenta fazer o fallback para o Graph diretamente se possível
    if (url.startsWith('/api/onedrive')) {
      let fallbackUrl = 'https://graph.microsoft.com/v1.0/me';
      if (url.startsWith('/api/onedrive/files')) {
        const parts = url.split('?');
        const searchParams = new URLSearchParams(parts[1] || '');
        const folderId = searchParams.get('folderId');
        fallbackUrl = folderId 
          ? `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`
          : `https://graph.microsoft.com/v1.0/me/drive/root/children`;
      }
      response = await fetch(fallbackUrl, { ...options, headers });
    } else {
      throw err;
    }
  }

  // Tratamento de renovação automática local do token (especialmente relevante para Vercel)
  if (response.status === 401 && refreshToken && !url.startsWith('/api/auth')) {
    console.warn("Acesso expirado no OneDrive (401), tentando renovar...");
    try {
      const config = await getOneDriveConfig();
      if (config && config.clientId) {
        const bodyParams: any = {
          client_id: config.clientId,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        };
        if (config.clientSecret) {
          bodyParams.client_secret = config.clientSecret;
        }

        const refreshRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(bodyParams),
        });

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData.access_token) {
            localStorage.setItem('onedrive_token', refreshData.access_token);
            if (refreshData.refresh_token) {
              localStorage.setItem('onedrive_refresh_token', refreshData.refresh_token);
            }
            
            // Refaz a chamada original com o novo token de acesso
            headers['Authorization'] = `Bearer ${refreshData.access_token}`;
            response = await fetch(finalUrl, { ...options, headers });
          }
        }
      }
    } catch (err) {
      console.error("Não foi possível renovar o token do OneDrive:", err);
    }
  }

  // Se o servidor original (Cloud Run) emitiu tokens renovados na resposta
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
    const isVercel = window.location.hostname.includes('vercel.app');

    if (!isVercel) {
      try {
        const res = await fetch('/api/auth/onedrive/url');
        if (res.ok) {
          const data = await res.json();
          if (data && data.url) {
            return data.url;
          }
        }
      } catch (e) {
        console.warn("Express backend offline ou inacessível no momento. Gerando URL no cliente...", e);
      }
    }

    // fallback / cliente-side completo (Vercel ou sem backend ativo)
    const config = await getOneDriveConfig();
    if (!config || !config.clientId) {
      throw new Error('OneDrive não está configurado. Registre o Client ID no painel de configurações para ativar a conexão.');
    }

    const currentRedirectUri = `${window.location.origin}/auth/callback`;
    const params = new URLSearchParams({
      client_id: config.clientId.trim(),
      response_type: "token", // Implicit Grant flow para SPAs estáticos sem necessidade de segredo no backend
      redirect_uri: currentRedirectUri,
      response_mode: "fragment",
      scope: "files.readwrite.all User.Read",
      state: "12345",
    });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  },

  async getUser(): Promise<OneDriveUser | null> {
    try {
      const res = await apiFetch('/api/onedrive/me');
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('onedrive_token');
          localStorage.removeItem('onedrive_refresh_token');
        }
        return null;
      }
      const data = await res.json();
      if (data && (data.error || !data.displayName)) {
        localStorage.removeItem('onedrive_token');
        localStorage.removeItem('onedrive_refresh_token');
        return null;
      }
      return data;
    } catch {
      return null;
    }
  },

  async getDiagnostics(): Promise<any> {
    const isVercel = window.location.hostname.includes('vercel.app');
    
    // Devolve dados inteligentes simulados/locais no Vercel
    if (isVercel) {
      const config = await getOneDriveConfig();
      const currentRedirect = `${window.location.origin}/auth/callback`;
      const hasId = !!config?.clientId;
      const hasSecret = !!config?.clientSecret;

      return {
        clientId: {
          rawLength: config?.clientId?.length || 0,
          trimmedLength: config?.clientId?.length || 0,
          isUuid: config ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.clientId) : false,
          censored: hasId ? `${config!.clientId.substring(0, 15)}...${config!.clientId.substring(config!.clientId.length - 4)}` : "Não configurado no Firestore"
        },
        clientSecret: {
          rawLength: config?.clientSecret?.length || 0,
          trimmedLength: config?.clientSecret?.length || 0,
          censored: hasSecret ? `${config!.clientSecret!.substring(0, 6)}...` : "Não configurado no Firestore"
        },
        appUrlFromEnv: window.location.origin,
        detectedHost: window.location.hostname,
        detectedProtocol: window.location.protocol.replace(':', ''),
        dynamicBaseUrl: window.location.origin,
        finalRedirectUri: currentRedirect,
        advice: {
          mismatch: "✅ Sincronizado com o domínio estático Vercel.",
          lengthCheck: hasId && config!.clientId.length !== 36 ? "⚠️ O ID do Cliente (Client ID) geralmente tem exatamente 36 caracteres. Verifique se copiou corretamente do portal do Azure." : "✅ Formato ID do cliente verificado."
        }
      };
    }

    const res = await apiFetch('/api/auth/onedrive/diagnostics');
    if (!res.ok) throw new Error('Falha ao obter diagnóstico de sincronização do OneDrive.');
    return await res.json();
  },

  async listFiles(folderId?: string): Promise<DriveItem[]> {
    const url = folderId ? `/api/onedrive/files?folderId=${folderId}` : '/api/onedrive/files';
    const res = await apiFetch(url);
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('onedrive_token');
        localStorage.removeItem('onedrive_refresh_token');
      }
      throw new Error('Falha ao listar arquivos do OneDrive: ' + res.status);
    }
    const data = await res.json();
    if (data && data.error) {
      throw new Error(data.error.message || 'Erro do OneDrive ao listar arquivos.');
    }
    return data.value || [];
  },

  // Obtém um link de visualização direta do PDF
  async getPreviewUrl(itemId: string): Promise<string> {
    return `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/preview`;
  },

  // Cria um link de compartilhamento público, anônimo e restrito estritamente a este único arquivo (impede ver a pasta em volta)
  async createShareLink(itemId: string): Promise<string> {
    const isVercel = window.location.hostname.includes('vercel.app');
    if (!isVercel) {
      try {
        const res = await apiFetch(`/api/onedrive/share-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.link && data.link.webUrl) {
            return data.link.webUrl;
          }
        }
      } catch (e) {
        console.warn("Express backend share-link inacessível. Tentando chamada cliente direta...", e);
      }
    }

    // Fallback cliente-side direto para o Graph (se por exemplo rodando em Vercel sem backend)
    const res = await apiFetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/createLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'view',
        scope: 'anonymous'
      })
    });

    if (!res.ok) {
      throw new Error('Falha ao gerar link seguro de compartilhamento.');
    }
    const data = await res.json();
    if (data && data.link && data.link.webUrl) {
      return data.link.webUrl;
    }
    throw new Error('Retorno do OneDrive não possui um link de visualização.');
  },

  // Retorna a URL de backend que fará o stream seguro, limpo, instantâneo e direto do arquivo do OneDrive
  getDirectViewUrl(itemId: string): string {
    const isVercel = window.location.hostname.includes('vercel.app');
    if (isVercel) {
      // No Vercel, o backend Express no mesmo domínio não está disponível, então retornamos string vazia
      // para orientar o componente front-end a abrir o link de compartilhamento nativo seguro (webUrl/shareLink) diretamente.
      return '';
    }
    const token = localStorage.getItem('onedrive_token') || '';
    const refreshToken = localStorage.getItem('onedrive_refresh_token') || '';
    const params = new URLSearchParams({ id: itemId });
    if (token) params.append('token', token);
    if (refreshToken) params.append('refresh_token', refreshToken);
    return `${window.location.origin}/api/onedrive/file-view?${params.toString()}`;
  },

  // Obtém um link de download direto assinado e temporário do arquivo OneDrive, impecável e seguro (bypassa a interface OneDrive)
  async getDirectSignedUrl(itemId: string): Promise<string> {
    try {
      const res = await apiFetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`);
      if (res.ok) {
        const data = await res.json();
        return data["@microsoft.graph.downloadUrl"] || "";
      }
    } catch (err) {
      console.error("Erro ao obter @microsoft.graph.downloadUrl do OneDrive:", err);
    }
    return "";
  }
};

/**
 * Utilitário para extrair o ID do arquivo OneDrive a partir de um link webUrl clássico de proprietário ou da nossa API de proxy seguro
 */
export function extractOneDriveItemId(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const lowerUrl = url.toLowerCase();
    if (!lowerUrl.includes('onedrive') && !lowerUrl.includes('live.com') && !lowerUrl.includes('/api/onedrive')) {
      return null;
    }
    const urlObj = new URL(url, window.location.origin);
    const id = urlObj.searchParams.get('id');
    return id || null;
  } catch {
    const match = url.match(/[?&]id=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}
