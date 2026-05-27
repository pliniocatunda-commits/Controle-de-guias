import express from "express";
import path from "path";
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

  // Microsoft OAuth Config
  const CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID ? process.env.ONEDRIVE_CLIENT_ID.trim() : "";
  const CLIENT_SECRET = process.env.ONEDRIVE_CLIENT_SECRET ? process.env.ONEDRIVE_CLIENT_SECRET.trim() : "";

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
  app.get("/api/auth/onedrive/diagnostics", (req, res) => {
    const rawId = process.env.ONEDRIVE_CLIENT_ID || "";
    const trimmedId = rawId.trim();
    const rawSecret = process.env.ONEDRIVE_CLIENT_SECRET || "";
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
  app.get("/api/auth/onedrive/url", (req, res) => {
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
      const currentRedirectUri = getRedirectUri(req);
      const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID!,
          client_secret: CLIENT_SECRET!,
          code: code as string,
          redirect_uri: currentRedirectUri,
          grant_type: "authorization_code",
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error_description || data.error);
      }

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
      return { token };
    }

    // 2. Se não tem token de acesso, tenta pegar refresh_token
    let refreshToken = req.headers["x-onedrive-refresh-token"] as string;
    if (!refreshToken) {
      refreshToken = req.cookies.onedrive_refresh_token;
    }

    if (!refreshToken) {
      return { token: null };
    }

    try {
      console.log("Renovando token do OneDrive usando refresh token...");
      const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID || "",
          client_secret: CLIENT_SECRET || "",
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });

      const data = await response.json();
      if (data.error) {
        console.error("Erro ao renovar token pelo refresh token:", data.error_description || data.error);
        return { token: null };
      }

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
    } catch (error) {
      console.error("Exceção ao tentar renovar o token:", error);
      return { token: null };
    }
  };

  // Proxy para Microsoft Graph (para evitar expor tokens no cliente)
  app.get("/api/onedrive/me", async (req, res) => {
    const { token } = await getValidToken(req, res);
    if (!token) return res.status(401).json({ error: "Não autenticado no OneDrive" });

    try {
      const response = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
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

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json(data);
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Erro ao listar arquivos" });
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
