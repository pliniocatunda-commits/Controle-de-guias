import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import "isomorphic-fetch";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // Helper fetch de alta confiabilidade com timeout integrado para evitar travamentos ou gargalos na gateway do Cloud Run
  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (err: any) {
      clearTimeout(id);
      if (err.name === 'AbortError') {
        throw new Error(`Timeout de conexão após ${timeoutMs}ms para a URL: ${url}`);
      }
      throw err;
    }
  };

  // Cache global para a configuração e tokens do OneDrive
  let onedriveCache: {
    clientId: string;
    clientSecret: string;
    accessToken: string;
    refreshToken: string;
    loadedAt: number;
  } | null = null;

  const getOneDriveConfig = async () => {
    // Se temos em cache e carregado há menos de 10 minutos, aproveitamos para máxima velocidade
    const CACHE_TTL = 10 * 60 * 1000; // 10 minutos
    if (onedriveCache && (Date.now() - onedriveCache.loadedAt < CACHE_TTL)) {
      return onedriveCache;
    }

    let clientId = process.env.ONEDRIVE_CLIENT_ID ? process.env.ONEDRIVE_CLIENT_ID.trim() : "";
    let clientSecret = process.env.ONEDRIVE_CLIENT_SECRET ? process.env.ONEDRIVE_CLIENT_SECRET.trim() : "";
    let accessToken = "";
    let refreshToken = "";

    // Tentamos ler o arquivo de configuração do Firebase de forma precisa
    let projectId = "ai-studio-9073c76a-ddf8-411b-b0ca-434330bbd34b"; // default fallback
    let databaseId = "(default)";
    let apiKey = "";

    try {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const fbConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (fbConfig.projectId) projectId = fbConfig.projectId;
        if (fbConfig.firestoreDatabaseId) databaseId = fbConfig.firestoreDatabaseId;
        if (fbConfig.apiKey) apiKey = fbConfig.apiKey;
      }
    } catch (err) {
      console.warn("[Backend Config] Falha ao parsear firebase-applet-config.json:", err);
    }

    // URL autenticada oficial do REST API do Firestore para ler a configuração
    let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/config/onedrive`;
    if (apiKey) {
      url += `?key=${apiKey}`;
    }

    try {
      console.log("[Backend REST] Buscando configuração no Firestore (autenticado)...");
      const fsRes = await fetchWithTimeout(url, {}, 5000); // tempo limite agressivo de 5s para não travar a UI
      if (fsRes.ok) {
        const fsData = await fsRes.json();
        const fields = fsData.fields || {};
        if (!clientId) {
          clientId = fields.clientId?.stringValue?.trim() || "";
        }
        if (!clientSecret) {
          clientSecret = fields.clientSecret?.stringValue?.trim() || "";
        }
        accessToken = fields.accessToken?.stringValue?.trim() || "";
        refreshToken = fields.refreshToken?.stringValue?.trim() || "";
        console.log("[Backend REST] Configuração do OneDrive carregada com sucesso do Firestore.");
      } else {
        console.warn(`[Backend REST] Falha ao sincronizar via Firestore (Status ${fsRes.status}):`, await fsRes.text());
      }
    } catch (err) {
      console.error("[Backend REST] Exceção na busca da configuração do OneDrive:", err);
    }

    onedriveCache = {
      clientId,
      clientSecret,
      accessToken,
      refreshToken,
      loadedAt: Date.now()
    };

    return onedriveCache;
  };

  const saveOneDriveTokens = async (accessToken: string, refreshToken?: string) => {
    try {
      let projectId = "ai-studio-9073c76a-ddf8-411b-b0ca-434330bbd34b"; // default fallback
      let databaseId = "(default)";
      let apiKey = "";

      try {
        const configPath = path.join(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(configPath)) {
          const fbConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
          if (fbConfig.projectId) projectId = fbConfig.projectId;
          if (fbConfig.firestoreDatabaseId) databaseId = fbConfig.firestoreDatabaseId;
          if (fbConfig.apiKey) apiKey = fbConfig.apiKey;
        }
      } catch (err) {
        console.warn("[Backend Config] Falha ao ler firebase-applet-config.json no salvamento:", err);
      }

      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/config/onedrive`;
      
      // Carrega o estado atual para não sobrescrever clientId/clientSecret se existirem apenas no Firestore
      let getUrl = url;
      if (apiKey) {
        getUrl += `?key=${apiKey}`;
      }

      let currentFields: any = {};
      try {
        const currentRes = await fetchWithTimeout(getUrl, {}, 4000);
        if (currentRes.ok) {
          const currentData = await currentRes.json();
          currentFields = currentData.fields || {};
        }
      } catch (fetchErr) {
        console.warn("[Backend REST] Não foi possível carregar campos atuais para mesclagem no salvamento:", fetchErr);
      }

      // Atualiza os campos relevantes em formato de chave de documento do Firestore REST API
      const updatedFields: any = {
        ...currentFields,
        accessToken: { stringValue: accessToken },
      };

      if (refreshToken) {
        updatedFields.refreshToken = { stringValue: refreshToken };
      }

      // Constrói url de patch com a API Key e a máscara de atualização
      let patchUrl = `${url}?updateMask.fieldPaths=accessToken${refreshToken ? "&updateMask.fieldPaths=refreshToken" : ""}`;
      if (apiKey) {
        patchUrl += `&key=${apiKey}`;
      }

      const patchRes = await fetchWithTimeout(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: updatedFields
        })
      }, 5000);

      if (patchRes.ok) {
        console.log("[Backend REST] Tokens do OneDrive salvos com sucesso no Firestore.");
      } else {
        console.error("[Backend REST] Falha ao persistir novos tokens no Firestore. Status:", patchRes.status, await patchRes.text());
      }

      // Atualiza o cache em memória após persistir
      if (onedriveCache) {
        onedriveCache.accessToken = accessToken;
        if (refreshToken) onedriveCache.refreshToken = refreshToken;
        onedriveCache.loadedAt = Date.now();
      }
    } catch (err) {
      console.error("[Backend REST] Exceção global ao salvar tokens no Firestore:", err);
    }
  };

  const refreshOneDriveToken = async (rToken: string): Promise<string | null> => {
    try {
      console.log("[Backend] Renovando token do OneDrive via refresh_token...");
      const config = await getOneDriveConfig();
      const response = await fetchWithTimeout("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId || "",
          client_secret: config.clientSecret || "",
          grant_type: "refresh_token",
          refresh_token: rToken,
        }),
      }, 7000);

      const data = await response.json();
      if (data.error) {
        console.error("[Backend] Erro ao renovar token com refresh_token:", data.error_description || data.error);
        return null;
      }

      const newAccessToken = data.access_token;
      const newRefreshToken = data.refresh_token || rToken;

      await saveOneDriveTokens(newAccessToken, newRefreshToken);
      return newAccessToken;
    } catch (err) {
      console.error("[Backend] Erro excepcional ao renovar token OneDrive:", err);
      return null;
    }
  };

  const getValidOneDriveToken = async (): Promise<string | null> => {
    const config = await getOneDriveConfig();
    let token = config.accessToken;

    if (!token) {
      if (config.refreshToken) {
        token = await refreshOneDriveToken(config.refreshToken);
      }
    } else {
      // Faz uma verificação de validade rápida com a API Graph de Microsoft
      try {
        const testRes = await fetchWithTimeout("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${token}` }
        }, 3000); // tempo de resposta agressivo de 3 segundos para validação silenciosa
        if (testRes.status === 401) {
          console.log("[Backend] O token em cache expirou. Renovando silenciosamente...");
          if (config.refreshToken) {
            token = await refreshOneDriveToken(config.refreshToken);
          } else {
            token = null;
          }
        }
      } catch (testErr) {
        console.error("[Backend] Falha na requisição de validação do token:", testErr);
      }
    }

    return token;
  };

  // Mantém função compatível para evitar quebra de contratos de rotas legadas
  const getOneDriveCredentials = async () => {
    const config = await getOneDriveConfig();
    return { clientId: config.clientId, clientSecret: config.clientSecret };
  };

  const getRedirectUri = (req: express.Request) => {
    let cleanAppUrl = process.env.APP_URL ? process.env.APP_URL.trim() : "";
    if (cleanAppUrl) {
      // Se a URL configurada já termina com /auth/callback, remove para evitar duplicação ao reconstruir
      if (cleanAppUrl.toLowerCase().endsWith("/auth/callback")) {
        cleanAppUrl = cleanAppUrl.substring(0, cleanAppUrl.length - "/auth/callback".length);
      }
      return `${cleanAppUrl.replace(/\/$/, "")}/auth/callback`;
    }
    // Dynamically detect domain from headers in proxy setups (Cloud Run/Nginx)
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const protocol = req.headers["x-forwarded-proto"] || "https";
    return `${protocol}://${host}/auth/callback`;
  };

  // API Route: Get Auth URL
  app.get("/api/auth/onedrive/diagnostics", async (req, res) => {
    const creds = await getOneDriveCredentials();
    const rawId = creds.clientId || "";
    const trimmedId = rawId.trim();
    const rawSecret = creds.clientSecret || "";
    const trimmedSecret = rawSecret.trim();
    const appUrl = (process.env.APP_URL || "").trim();

    const host = req.headers["x-forwarded-host"] || req.headers.host || "";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const dynamicUrl = `${proto}://${host}`;

    const finalRedirect = getRedirectUri(req);

    res.json({
      clientId: {
        rawLength: rawId.length,
        trimmedLength: trimmedId.length,
        isUuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedId),
        censored: trimmedId ? `${trimmedId.substring(0, 15)}...${trimmedId.substring(trimmedId.length - 4)}` : "Não configurado"
      },
      clientSecret: {
        rawLength: rawSecret.length,
        trimmedLength: trimmedSecret.length,
        censored: trimmedSecret ? `${trimmedSecret.substring(0, 6)}...${trimmedSecret.substring(trimmedSecret.length - 4)}` : "Não configurado"
      },
      appUrlFromEnv: appUrl || "Não configurado",
      detectedHost: host,
      detectedProtocol: proto,
      dynamicBaseUrl: dynamicUrl,
      finalRedirectUri: finalRedirect,
      advice: {
        mismatch: appUrl && !finalRedirect.startsWith(appUrl.replace(/\/$/, "")) ? "⚠️ O APP_URL das configurações de ambiente não coincide com o redirecionamento final." : "✅ Formato de URL de redirecionamento consistente.",
        lengthCheck: trimmedId.length !== 36 ? "⚠️ O ID do Cliente (Client ID) no Azure AD geralmente tem exatamente 36 caracteres. Por favor, verifique se ocorreu algum corte de carácteres ao copiar e colar." : "✅ O ID do cliente tem o formato e tamanho padrão esperados."
      }
    });
  });

  // API Route: Get Auth URL
  app.get("/api/auth/onedrive/url", async (req, res) => {
    const creds = await getOneDriveCredentials();
    const CLIENT_ID = creds.clientId;
    if (!CLIENT_ID) {
      return res.status(500).json({ error: "ONEDRIVE_CLIENT_ID não está configurado." });
    }

    const trimmedClientId = CLIENT_ID;
    const isEmail = trimmedClientId.includes("@");
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedClientId);

    if (isEmail || !isUuid) {
      return res.status(400).json({ 
        error: `O ONEDRIVE_CLIENT_ID configurado é inválido. Atualmente está configurado como "${trimmedClientId}", mas deveria ser o ID de Aplicativo (UUID) do Azure AD com formato "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx". Certifique-se de que não inseriu seu e-mail de login pessoal no campo Client ID nas configurações de variáveis de ambiente.` 
      });
    }

    const currentRedirectUri = getRedirectUri(req);
    console.log("DEBUG: OneDrive Authorization Request URI:", currentRedirectUri);

    const params = new URLSearchParams({
      client_id: trimmedClientId,
      response_type: "code",
      redirect_uri: currentRedirectUri,
      response_mode: "query",
      scope: "files.readwrite.all User.Read offline_access",
      state: "12345", // Em produção use algo dinâmico
    });

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
    res.json({ url: authUrl });
  });

  // OAuth Callback
  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("Código de autorização ausente");
    }

    try {
      const creds = await getOneDriveCredentials();
      const currentRedirectUri = getRedirectUri(req);
      const response = await fetchWithTimeout("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: creds.clientId || "",
          client_secret: creds.clientSecret || "",
          code: code as string,
          redirect_uri: currentRedirectUri,
          grant_type: "authorization_code",
        }),
      }, 8000);

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error_description || data.error);
      }

      // Persiste os novos tokens no Firestore como o acesso global da prefeitura ao OneDrive
      console.log("[Callback] Salvando novos tokens no Firestore como acesso global do sistema...");
      await saveOneDriveTokens(data.access_token, data.refresh_token);

      // Salva no cookie (SameSite=None e Secure para iframe)
      res.cookie("onedrive_token", data.access_token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: data.expires_in * 1000,
      });

      if (data.refresh_token) {
        res.cookie("onedrive_refresh_token", data.refresh_token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias
        });
      }

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'ONEDRIVE_AUTH_SUCCESS',
                  token: ${JSON.stringify(data.access_token)},
                  refreshToken: ${JSON.stringify(data.refresh_token || null)}
                }, '*');
                window.close();
              } else {
                localStorage.setItem('onedrive_token', ${JSON.stringify(data.access_token)});
                if (${JSON.stringify(data.refresh_token || null)}) {
                  localStorage.setItem('onedrive_refresh_token', ${JSON.stringify(data.refresh_token || null)});
                }
                window.location.href = '/';
              }
            </script>
            <p>Autenticação concluída com sucesso! Esta janela fechará automaticamente.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Erro no callback OAuth:", error);
      res.status(500).send(`Erro na autenticação: ${error.message}`);
    }
  });

  const getValidToken = async (req: express.Request, res: express.Response): Promise<{ token: string | null }> => {
    // 1. Tenta pegar do Header de Autorização
    let token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.substring(7)
      : null;

    if (!token) {
      token = req.cookies.onedrive_token;
    }

    if (token) {
      // Verifica de forma resiliente e silenciosa se o token individual ainda é válido antes de retorná-lo
      try {
        const testRes = await fetchWithTimeout("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${token}` }
        }, 3000);
        
        if (testRes.status !== 401) {
          return { token };
        }
        console.log("[getValidToken] Token individual expirado ou inválido (401). Forçando renovação...");
        token = null; // Zera para prosseguir ao passo 2 de renovação
      } catch (testErr) {
        console.error("[getValidToken] Falha de rede temporária ao testar token. Assumindo válido para evitar bloqueios:", testErr);
        return { token };
      }
    }

    // 2. Se não tem token de acesso, tenta pegar refresh_token
    let refreshToken = req.headers["x-onedrive-refresh-token"] as string;
    if (!refreshToken) {
      refreshToken = req.cookies.onedrive_refresh_token;
    }

    if (refreshToken) {
      try {
        console.log("Renovando token do OneDrive usando refresh token...");
        const creds = await getOneDriveCredentials();
        const response = await fetchWithTimeout("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: creds.clientId || "",
            client_secret: creds.clientSecret || "",
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
        }, 8000);

        const data = await response.json();
        if (data.error) {
          console.error("Erro ao renovar token pelo refresh token:", data.error_description || data.error);
        } else {
          // Salva em cookies se suportado
          res.cookie("onedrive_token", data.access_token, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: data.expires_in * 1000,
          });

          if (data.refresh_token) {
            res.cookie("onedrive_refresh_token", data.refresh_token, {
              httpOnly: true,
              secure: true,
              sameSite: "none",
              maxAge: 30 * 24 * 60 * 60 * 1000,
            });
          }

          // Expõe os novos tokens nos cabeçalhos de resposta para que o cliente atualize seu localStorage
          res.setHeader("Access-Control-Expose-Headers", "x-new-access-token, x-new-refresh-token");
          res.setHeader("x-new-access-token", data.access_token);
          if (data.refresh_token) {
            res.setHeader("x-new-refresh-token", data.refresh_token);
          }

          return { token: data.access_token };
        }
      } catch (error) {
        console.error("Exceção ao tentar renovar o token:", error);
      }
    }

    // 3. Fallback: Se não tem token individual, busca o token global do OneDrive guardado no Firestore
    console.log("[getValidToken] Token individual ausente ou expirado. Buscando token global do Firestore...");
    const globalToken = await getValidOneDriveToken();
    if (globalToken) {
      return { token: globalToken };
    }

    return { token: null };
  };

  // Proxy para Microsoft Graph (para evitar expor tokens no cliente)
  app.get("/api/onedrive/me", async (req, res) => {
    const { token } = await getValidToken(req, res);
    if (!token) return res.status(401).json({ error: "Não autenticado no OneDrive" });

    try {
      const response = await fetchWithTimeout("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${token}` },
      }, 5000);
      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json(data);
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar dados do usuário" });
    }
  });

  // Rota para listar arquivos de uma pasta específica ou root
  app.get("/api/onedrive/files", async (req, res) => {
    const { token } = await getValidToken(req, res);
    const { folderId } = req.query;
    if (!token) return res.status(401).json({ error: "Não autenticado no OneDrive" });

    try {
      const url = folderId 
        ? `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`
        : `https://graph.microsoft.com/v1.0/me/drive/root/children`;

      const response = await fetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${token}` },
      }, 8000);
      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json(data);
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Erro ao listar arquivos" });
    }
  });

  // Rota para criar um link de compartilhamento seguro apenas de visualização (evita visualização da pasta pai)
  app.post("/api/onedrive/share-link", async (req, res) => {
    const { token } = await getValidToken(req, res);
    const { itemId } = req.body;
    if (!token) return res.status(401).json({ error: "Não autenticado no OneDrive" });
    if (!itemId) return res.status(400).json({ error: "itemId do OneDrive ausente" });

    try {
      console.log(`[OneDrive Share] Gerando link de visualização seguro para item: ${itemId}`);
      const response = await fetchWithTimeout(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/createLink`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "view",
          scope: "anonymous"
        })
      }, 8000);

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json(data);
      }
      res.json(data);
    } catch (error: any) {
      console.error("[OneDrive Share] Erro ao criar link de compartilhamento:", error);
      res.status(500).json({ error: "Erro ao gerar link de compartilhamento" });
    }
  });

  // Rota de visualização direta, limpa e segura (bypassa toda a UI e abre o PDF nativo do navegador)
  app.get("/api/onedrive/file-view", async (req, res) => {
    const itemId = req.query.id as string;
    if (!itemId) {
      return res.status(400).send("Identificador do item (id) ausente.");
    }

    // Tenta obter o token válido diretamente do cache global/Firestore para máxima velocidade e contornar restrições de cookies
    console.log("[Proxy View] Obtendo token com cache em memória de alta velocidade para o item:", itemId);
    let token = await getValidOneDriveToken();

    // Fallback secundário em cookies/parâmetros caso o banco de dados falhe
    if (!token) {
      token = (req.query.token as string) || "";
    }
    if (!token) {
      const authResult = await getValidToken(req, res);
      token = authResult.token || "";
    }

    if (!token) {
      return res.status(401).send("Sua sessão do OneDrive expirou ou não está autenticada. Reconecte o OneDrive nas configurações para visualizar seus arquivos.");
    }

    try {
      console.log(`[Proxy View] Obtendo URL direta do OneDrive para item: ${itemId}`);
      
      const itemRes = await fetchWithTimeout(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }, 6000);

      if (!itemRes.ok) {
        throw new Error(`Erro ao obter metadados (Status ${itemRes.status})`);
      }

      const itemData = await itemRes.json();
      const directDownloadUrl = itemData["@microsoft.graph.downloadUrl"];
      const fileName = itemData.name || "documento";
      const lowerName = fileName.toLowerCase();

      // Detecta formatos do Microsoft Office que navegadores comuns não renderizam nativamente
      const isOfficeFile = 
        lowerName.endsWith(".doc") || 
        lowerName.endsWith(".docx") || 
        lowerName.endsWith(".xls") || 
        lowerName.endsWith(".xlsx") || 
        lowerName.endsWith(".ppt") || 
        lowerName.endsWith(".pptx") || 
        lowerName.endsWith(".xlsb") || 
        lowerName.endsWith(".xlsm");

      if (directDownloadUrl) {
        if (isOfficeFile) {
          console.log(`[Proxy View] Detectado documento Microsoft Office (${fileName}). Redirecionando para visualizador Office Web oficial.`);
          const officeViewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(directDownloadUrl)}`;
          return res.redirect(officeViewerUrl);
        } else {
          console.log(`[Proxy View] Redirecionando instantaneamente o navegador para a URL assinada direta do arquivo.`);
          return res.redirect(directDownloadUrl);
        }
      } else {
        // Fallback robusto para visualização OneDrive se o link direto não estiver disponível
        console.log(`[Proxy View] URL direta não encontrada, redirecionando para a visualização web OneDrive.`);
        const webUrl = itemData.webUrl || "";
        if (webUrl) {
          return res.redirect(webUrl);
        }
        return res.status(404).send("Documento não encontrado ou URL não disponível.");
      }
    } catch (error: any) {
      console.error("[Proxy View] Erro crítico ao redirecionar para visualização segura:", error);
      res.status(500).send("Erro interno no servidor de redirecionamento para o OneDrive.");
    }
  });

  // API Route: Extract PDF Data from OneDrive using Gemini
  app.post("/api/onedrive/extract-ai", async (req, res) => {
    const { token } = await getValidToken(req, res);
    if (!token) {
      return res.status(401).json({ error: "Não autenticado no OneDrive" });
    }

    const { itemId, type, filename } = req.body;
    if (!itemId) {
      return res.status(400).json({ error: "itemId do OneDrive ausente" });
    }

    try {
      console.log(`[OneDrive AI] Fetching file content for itemId: ${itemId}, filename: ${filename}`);
      let base64Data = "";

      try {
        console.log(`[OneDrive AI] Iniciando download do arquivo ${itemId}...`);
        let fileBuffer: Buffer | null = null;

        // Estratégia 1: Tenta obter pelo @microsoft.graph.downloadUrl direto dos metadados
        try {
          const itemRes = await fetchWithTimeout(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }, 6000);

          if (itemRes.ok) {
            const itemData = await itemRes.json();
            const directDownloadUrl = itemData["@microsoft.graph.downloadUrl"];
            if (directDownloadUrl) {
              console.log(`[OneDrive AI] Obtido link direto @microsoft.graph.downloadUrl. Baixando de forma segura...`);
              const downloadRes = await fetchWithTimeout(directDownloadUrl, {}, 10000);
              if (downloadRes.ok) {
                const arrayBuffer = await downloadRes.arrayBuffer();
                fileBuffer = Buffer.from(arrayBuffer);
                console.log(`[OneDrive AI] Download concluído com sucesso via link direto.`);
              } else {
                console.warn(`[OneDrive AI] Falha ao baixar de directDownloadUrl. Status: ${downloadRes.status}`);
              }
            }
          } else {
            console.warn(`[OneDrive AI] Falha ao consultar metadados do OneDrive. Status: ${itemRes.status}`);
          }
        } catch (metadataError: any) {
          console.warn(`[OneDrive AI] Erro ao tentar Estratégia 1: ${metadataError.message}`);
        }

        // Estratégia 2 (Fallback): Custom redirect follow para o endpoint clássico /content para evitar que o Header de Authorization seja encaminhado para o CDN do SharePoint
        if (!fileBuffer) {
          console.log(`[OneDrive AI] Tentando baixar do endpoint clássico /content com redirecionamento manual...`);
          const contentRes = await fetchWithTimeout(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/content`, {
            headers: { Authorization: `Bearer ${token}` },
            redirect: "manual"
          }, 10000);

          let downloadUrl = "";
          // Um redirect manual com node-fetch retornará status entre 300 e 399
          if (contentRes.status >= 300 && contentRes.status < 400) {
            const loc = contentRes.headers.get("location");
            if (loc) {
              downloadUrl = loc;
              console.log(`[OneDrive AI] Redirecionamento 3xx detectado com sucesso. URL de download final: ${downloadUrl.substring(0, 80)}...`);
            }
          }

          if (downloadUrl) {
            // Requisição sem cabeçalhos de Authorization para evitar erro de assinatura no CDN do Azure/SharePoint
            const rawDownloadRes = await fetchWithTimeout(downloadUrl, {}, 15000);
            if (rawDownloadRes.ok) {
              const arrayBuffer = await rawDownloadRes.arrayBuffer();
              fileBuffer = Buffer.from(arrayBuffer);
              console.log(`[OneDrive AI] Download concluído com sucesso via controle de redirecionamento manual.`);
            } else {
              throw new Error(`Falha no download via controle manual de redirecionamento. Status: ${rawDownloadRes.statusText} (${rawDownloadRes.status})`);
            }
          } else {
            // Se não retornou redirect mas sim o arquivo direto
            if (contentRes.ok) {
              const arrayBuffer = await contentRes.arrayBuffer();
              fileBuffer = Buffer.from(arrayBuffer);
              console.log(`[OneDrive AI] Download direto sem redirecionamento concluído com sucesso.`);
            } else {
              throw new Error(`Falha ao baixar do endpoint /content. Status: ${contentRes.statusText} (${contentRes.status})`);
            }
          }
        }

        if (!fileBuffer || fileBuffer.length === 0) {
          throw new Error("Falha ao recuperar o conteúdo do arquivo. O buffer está vazio.");
        }

        base64Data = fileBuffer.toString("base64");
      } catch (fileError: any) {
        console.error(`[OneDrive AI] Erro crítico no download ou processamento do arquivo:`, fileError);
        return res.status(500).json({ error: `Falha na rede ou permissão ao tentar resgatar o arquivo do OneDrive. Detalhes: ${fileError.message}` });
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY não configurada no servidor" });
      }

      const { GoogleGenAI, Type, ThinkingLevel } = await import("@google/genai");
      const client = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const MODEL_NAME = "gemini-3.5-flash";

      if (type === "comprovante") {
        console.log(`[Backend AI] Extracting OneDrive COMPROVANTE: ${filename}`);
        const response = await client.models.generateContent({
          model: MODEL_NAME,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: "application/pdf",
                  },
                },
                {
                  text: `Você é um robô extrator de COMPROVANTES DE PAGAMENTO BANCÁRIO.
                  
                  ARQUIVO: ${filename || "Comprovante PDF"}
                  
                  INSTRUÇÕES:
                  1. Localize o VALOR PAGO.
                  2. Localize a DATA DO PAGAMENTO (YYYY-MM-DD) se estiver visível.
                  3. LOCALIZAR VÍNCULO: Procure por qualquer texto que identifique a guia paga. O código GRCP esperado é "NNNN/PME-XXX/AAAA". Às vezes está no campo de identificação, observação ou no corpo do texto. Se não encontrar de forma nenhuma, retorne string vazia "".
                  
                  IMPORTANTE: Se você não encontrar o código GRCP no texto do comprovante mas o NOME DO ARQUIVO contiver algo como "0022-PME-PAT-2026" ou similar, use essa informação para preencher 'identificacaoGrcp'.`,
                },
              ],
            },
          ],
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                valorPago: { type: Type.NUMBER },
                dataPagamento: { type: Type.STRING },
                identificacaoGrcp: { type: Type.STRING },
              },
              required: ["valorPago"],
            },
          },
        });

        const text = response.text;
        console.log("[Backend AI] Result (OneDrive Comprovante):", text);
        if (text) {
          const parsed = JSON.parse(text);
          return res.json(parsed);
        }
        throw new Error("Resposta da IA vazia");
      } else {
        console.log(`[Backend AI] Extracting OneDrive GUIA: ${filename}`);
        const response = await client.models.generateContent({
          model: MODEL_NAME,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: "application/pdf",
                  },
                },
                {
                  text: `Você é um robô extrator de dados de GUIA DE RECOLHIMENTO (GRCP) da prefeitura.
                  
                  ARQUIVO: ${filename || "Documento PDF"}
                  
                  INSTRUÇÕES:
                  1. Localize o campo de IDENTIFICAÇÃO GRCP. Ele segue o padrão "NNNN/PME-XXX/AAAA" (ex: 0022/PME-PAT/2026, ou 0213/PME-PAT/2026). É CRUCIAL extrair este código exatamente. Se houver variação no número de dígitos antes da barra (ex: 0213 ou 213), traga o código completo exatamente como está impresso. Se não encontrar o código de jeito nenhum, retorne string vazia "".
                  2. Determine o TIPO de guia. Se o código contiver PAT, é 'patronal'. Se contiver SEG, é 'segurado'. Se não estiver explícito no código mas estiver indicado "PATRONAL" na folha, use 'patronal'.
                  3. Extraia o VALOR TOTAL de recolhimento da guia. Verifique com muito cuidado: no rodapé ou no bloco de valores haverá campos como "Total Líquido", "SubTotal Arrecadação", ou "Valor Líquido". Procure pela linha final chamada "Total Líquido" ou "SubTotal Arrecadação" ou similar e extraia esse valor numérico (por exemplo, se estiver escrito "3.286,86", extraia o número 3286.86). Não confunda com a Base de Cálculo (ex: 22.044,65).
                  4. Extraia o VENCIMENTO (YYYY-MM-DD) se encontrar.
                  5. Extraia o MÊS e ANO de competência (referência) se encontrar.
                  6. NOME: Descrição da guia ou departamento.
                  
                  DICA: O código GRCP geralmente está no topo ou perto do título "Guia de Recolhimento" (ex: "Identificação GRCP: 0213/PME-PAT/2026").`,
                },
              ],
            },
          ],
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                nome: { type: Type.STRING },
                valor: { type: Type.NUMBER },
                vencimento: { type: Type.STRING },
                mes: { type: Type.INTEGER },
                ano: { type: Type.INTEGER },
                tipo: { type: Type.STRING, enum: ["patronal", "segurado"] },
                identificacaoGrcp: { type: Type.STRING },
              },
              required: ["valor", "identificacaoGrcp"],
            },
          },
        });

        const text = response.text;
        console.log("[Backend AI] Result (OneDrive Guia):", text);
        if (text) {
          const parsed = JSON.parse(text);
          return res.json(parsed);
        }
        throw new Error("Resposta da IA vazia");
      }
    } catch (error: any) {
      console.error("[Backend AI] Erro na extração do OneDrive:", error);
      res.status(500).json({ error: error.message || "Erro para extrair arquivo do OneDrive com Gemini" });
    }
  });

  // API Route: Extract PDF Data using Gemini
  app.post("/api/gemini/extract", async (req, res) => {
    try {
      const { base64Data, mimeType, filename, type } = req.body;
      if (!base64Data) {
        return res.status(400).json({ error: "Dados base64 ausentes" });
      }

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY não configurada no servidor" });
      }

      const { GoogleGenAI, Type, ThinkingLevel } = await import("@google/genai");
      const client = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const MODEL_NAME = "gemini-3.5-flash";

      if (type === "comprovante") {
        console.log(`[Backend AI] Extracting COMPROVANTE: ${filename}`);
        const response = await client.models.generateContent({
          model: MODEL_NAME,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: mimeType || "application/pdf",
                  },
                },
                {
                  text: `Você é um robô extrator de COMPROVANTES DE PAGAMENTO BANCÁRIO.
                  
                  ARQUIVO: ${filename || "Comprovante PDF"}
                  
                  INSTRUÇÕES:
                  1. Localize o VALOR PAGO.
                  2. Localize a DATA DO PAGAMENTO (YYYY-MM-DD) se estiver visível.
                  3. LOCALIZAR VÍNCULO: Procure por qualquer texto que identifique a guia paga. O código GRCP esperado é "NNNN/PME-XXX/AAAA". Às vezes está no campo de identificação, observação ou no corpo do texto. Se não encontrar, retorne string vazia "".
                  
                  IMPORTANTE: Se você não encontrar o código GRCP no texto do comprovante mas o NOME DO ARQUIVO contiver algo como "0022-PME-PAT-2026" ou similar, use essa informação para preencher 'identificacaoGrcp'.`,
                },
              ],
            },
          ],
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                valorPago: { type: Type.NUMBER },
                dataPagamento: { type: Type.STRING },
                identificacaoGrcp: { type: Type.STRING },
              },
              required: ["valorPago"],
            },
          },
        });

        const text = response.text;
        console.log("[Backend AI] Result (Comprovante):", text);
        if (text) {
          const parsed = JSON.parse(text);
          return res.json(parsed);
        }
        throw new Error("Resposta da IA vazia");
      } else {
        console.log(`[Backend AI] Extracting GUIA: ${filename}`);
        const response = await client.models.generateContent({
          model: MODEL_NAME,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: mimeType || "application/pdf",
                  },
                },
                {
                  text: `Você é um robô extrator de dados de GUIA DE RECOLHIMENTO (GRCP) da prefeitura.
                  
                  ARQUIVO: ${filename || "Documento PDF"}
                  
                  INSTRUÇÕES:
                  1. Localize o campo de IDENTIFICAÇÃO GRCP. Ele segue o padrão "NNNN/PME-XXX/AAAA" (ex: 0022/PME-PAT/2026, ou 0213/PME-PAT/2026). É CRUCIAL extrair este código exatamente. Se houver variação no número de dígitos antes da barra (ex: 0213 ou 213), traga o código completo exatamente como está impresso. Se não encontrar o código de jeito nenhum, retorne string vazia "".
                  2. Determine o TIPO de guia. Se o código contiver PAT, é 'patronal'. Se contiver SEG, é 'segurado'. Se não estiver explícito no código mas estiver indicado "PATRONAL" na folha, use 'patronal'.
                  3. Extraia o VALOR TOTAL de recolhimento da guia. Verifique com muito cuidado: no rodapé ou no bloco de valores haverá campos como "Total Líquido", "SubTotal Arrecadação", ou "Valor Líquido". Procure pela linha final chamada "Total Líquido" ou "SubTotal Arrecadação" ou similar e extraia esse valor numérico (por exemplo, se estiver escrito "3.286,86", extraia o número 3286.86). Não confunda com a Base de Cálculo (ex: 22.044,65).
                  4. Extraia o VENCIMENTO (YYYY-MM-DD) se encontrar.
                  5. Extraia o MÊS e ANO de competência (referência) se encontrar.
                  6. NOME: Descrição da guia ou departamento.
                  
                  DICA: O código GRCP geralmente está no topo ou perto do título "Guia de Recolhimento" (ex: "Identificação GRCP: 0213/PME-PAT/2026").`,
                },
              ],
            },
          ],
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                nome: { type: Type.STRING },
                valor: { type: Type.NUMBER },
                vencimento: { type: Type.STRING },
                mes: { type: Type.INTEGER },
                ano: { type: Type.INTEGER },
                tipo: { type: Type.STRING, enum: ["patronal", "segurado"] },
                identificacaoGrcp: { type: Type.STRING },
              },
              required: ["valor", "identificacaoGrcp"],
            },
          },
        });

        const text = response.text;
        console.log("[Backend AI] Result (Guia):", text);
        if (text) {
          const parsed = JSON.parse(text);
          return res.json(parsed);
        }
        throw new Error("Resposta da IA vazia");
      }
    } catch (error: any) {
      console.error("[Backend AI] Erro na extração:", error);
      res.status(500).json({ error: error.message || "Erro desconhecido na extração com Gemini" });
    }
  });

  // Vite Middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
