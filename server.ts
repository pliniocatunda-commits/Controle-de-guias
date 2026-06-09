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
      let downloadResponse: any;

      try {
        // 1. Obter metadados do arquivo para pegar o link direto de download sem precisar enviar o Header de Authorization para os servidores de CDN de redirecionamento do SharePoint. O que costuma falhar ou travar no Node.
        console.log(`[OneDrive AI] Solicitando metadados do item ${itemId}...`);
        const itemRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (itemRes.ok) {
          const itemData = await itemRes.json();
          const directDownloadUrl = itemData["@microsoft.graph.downloadUrl"];
          if (directDownloadUrl) {
            console.log(`[OneDrive AI] Copiando de @microsoft.graph.downloadUrl diretamente.`);
            downloadResponse = await fetch(directDownloadUrl);
          } else {
            throw new Error("Link direto @microsoft.graph.downloadUrl não encontrado nos metadados do item.");
          }
        } else {
          throw new Error(`Erro ao consultar metadados do OneDrive: ${itemRes.statusText}`);
        }
      } catch (directDownloadError: any) {
        console.warn(`[OneDrive AI] Fallback para endpoint clássico de /content devido a: ${directDownloadError.message}`);
        downloadResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/content`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      if (!downloadResponse.ok) {
        throw new Error(`Erro ao baixar arquivo do OneDrive: ${downloadResponse.statusText}`);
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Data = buffer.toString("base64");

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
