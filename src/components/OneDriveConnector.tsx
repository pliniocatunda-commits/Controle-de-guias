import React, { useState, useEffect } from 'react';
import { onedriveService, OneDriveUser } from '../services/onedriveService';
import { Cloud, Check, Loader2, AlertCircle, HelpCircle, ChevronDown, ChevronUp, ExternalLink, Copy, CheckCircle2 } from 'lucide-react';

interface Props {
  role?: string;
}

export default function OneDriveConnector({ role }: Props) {
  const [user, setUser] = useState<OneDriveUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);

  // Estados para configuração do OneDrive salvas no Firestore para Vercel
  const [configClientId, setConfigClientId] = useState('');
  const [configClientSecret, setConfigClientSecret] = useState('');
  const [configTenant, setConfigTenant] = useState('common');
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    checkStatus();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ONEDRIVE_AUTH_SUCCESS') {
        const { token, refreshToken } = event.data;
        if (token) {
          localStorage.setItem('onedrive_token', token);
        }
        if (refreshToken) {
          localStorage.setItem('onedrive_refresh_token', refreshToken);
        }
        checkStatus();
      } else if (event.data?.type === 'ONEDRIVE_AUTH_FAILURE') {
        setError("Falha na autenticação: " + (event.data.error || "Erro desconhecido") + ". Verifique se o Client ID e o Client Secret estão configurados corretamente e se o URI de redirecionamento está registrado no Portal Azure AD.");
        setShowHelp(true);
      }
    };

    const handleFocus = () => {
      checkStatus();
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    if (showHelp) {
      loadDiagnostics();
      loadConfigFromFirestore();
    }
  }, [showHelp]);

  const loadConfigFromFirestore = async () => {
    try {
      const { getOneDriveConfig } = await import('../services/onedriveService');
      const config = await getOneDriveConfig();
      if (config) {
        setConfigClientId(config.clientId || '');
        setConfigClientSecret(config.clientSecret || '');
        setConfigTenant(config.tenant || 'common');
      }
    } catch (e) {
      console.error("Erro ao carregar configurações do OneDrive do Firestore:", e);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setSaveSuccess(false);
    try {
      const { saveOneDriveConfig } = await import('../services/onedriveService');
      await saveOneDriveConfig({
        clientId: configClientId,
        clientSecret: configClientSecret,
        tenant: configTenant
      });
      setSaveSuccess(true);
      await loadDiagnostics();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert("Erro ao salvar credenciais no Firebase: " + err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const loadDiagnostics = async () => {
    setLoadingDiag(true);
    try {
      const data = await onedriveService.getDiagnostics();
      setDiagnostics(data);
    } catch (err) {
      console.error("Erro ao carregar diagnósticos:", err);
    } finally {
      setLoadingDiag(false);
    }
  };

  const checkStatus = async () => {
    setLoading(true);
    try {
      const userData = await onedriveService.getUser();
      setUser(userData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setError(null);
    try {
      const url = await onedriveService.getAuthUrl();
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        window.location.href = url;
        return;
      }

      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const popup = window.open(url, 'onedrive_auth', `width=${width},height=${height},left=${left},top=${top}`);
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.location.href = url;
      }
    } catch (err: any) {
      setError(err.message || "Não foi possível iniciar a conexão com o OneDrive. Certifique-se de configurar o Client ID no painel abaixo.");
      setShowHelp(true);
    }
  };

  const getRedirectUri = () => {
    return `${window.location.origin}/auth/callback`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(getRedirectUri());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-6 flex justify-center items-center gap-2">
      <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      <span className="text-xs text-gray-500 font-medium">Verificando conexão OneDrive...</span>
    </div>
  );

  const isVercel = window.location.hostname.includes('vercel.app');

  return (
    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm mb-6">
      {isVercel && (
        <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-2 leading-relaxed">
          <div className="flex items-center gap-2 font-bold text-blue-950">
            <CheckCircle2 size={16} className="text-blue-500 shrink-0" />
            <span>Suporte a Conexão Direta Ativado (Vercel)</span>
          </div>
          <p>
            Você está acessando a aplicação via Vercel (<code>controle-de-guias.vercel.app</code>). Desenvolvemos um mecanismo inteligente que conecta e sincroniza os arquivos do OneDrive diretamente no seu navegador, dispensando a necessidade de um servidor de backend ativo neste domínio!
          </p>
          <p className="font-semibold text-blue-950">
            💡 Basta clicar no botão de ajuda <strong>(ícone de interrogação "?")</strong> ao lado do botão de conexão para registrar seu Client ID do Azure AD de forma simples e segura.
          </p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${user ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
            <Cloud size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Armazenamento OneDrive</h3>
            <p className="text-xs text-gray-500">
              {user ? `Conectado como: ${user.displayName}` : 'Conecte sua conta pessoal ou corporativa para carregar guias vinculadas'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {role === 'master' && (
            <button
              onClick={() => setShowHelp(!showHelp)}
              className={`p-2.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-semibold ${
                showHelp 
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              }`}
              title="Parametrização e Configurações de Integração do OneDrive"
            >
              <HelpCircle size={15} />
              <span>{showHelp ? "Ocultar Painel" : "Parametrização OneDrive"}</span>
            </button>
          )}
          
          {user ? (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full text-xs font-bold">
              <Check size={14} />
              <span>Ativo</span>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-sm"
            >
              <Cloud size={14} />
              Conectar OneDrive
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-700 flex items-start gap-2.5 leading-relaxed">
          <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold mb-1">Falha de Autenticação:</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Interactive Helper / Debugger Panel */}
      {showHelp && (
        <div className="mt-5 pt-5 border-t border-gray-100 text-xs text-gray-600 space-y-4">
          <h4 className="font-bold text-gray-900 flex items-center gap-1.5 text-xs uppercase tracking-wider">
            <span>Guia de Diagnóstico e Configuração do Azure AD / OneDrive</span>
          </h4>

          {/* REALTIME SYSTEM DIAGNOSTIC ANALYSIS */}
          <div className="p-4 bg-slate-900 text-slate-100 rounded-xl space-y-3 font-mono text-[11px] border border-slate-800 shadow-inner">
            <div className="flex items-center justify-between border-b border-slate-850 pb-1.5 text-[9px] uppercase font-bold tracking-widest text-[#a5b4fc]">
              <span>🔍 Painel de Teste de Integração (Tempo Real)</span>
              {loadingDiag ? <span>Analisando...</span> : <button onClick={loadDiagnostics} className="text-[#6366f1] underline hover:text-[#818cf8]">Atualizar</button>}
            </div>

            {loadingDiag ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-450" />
                <span>Carregando variáveis de ambiente...</span>
              </div>
            ) : diagnostics ? (
              <div className="space-y-2">
                <div>
                  <span className="text-gray-400">ONEDRIVE_CLIENT_ID:</span>{" "}
                  <span className={diagnostics.clientId.isUuid && diagnostics.clientId.trimmedLength === 36 ? "text-emerald-400" : "text-rose-400"}>
                    {diagnostics.clientId.censored}
                  </span>
                  <div className="pl-3 text-[10px] text-gray-400 mt-0.5 space-y-0.5">
                    <div>• Tamanho: <span className="font-bold">{diagnostics.clientId.trimmedLength}</span> caracteres {diagnostics.clientId.trimmedLength === 36 ? "✅ (Correto - UUID)" : "❌ (Incorreto - Deve ter exatamente 36 caracteres!)"}</div>
                    <div>• Formato UUID: {diagnostics.clientId.isUuid ? "✅ Válido" : "❌ Inválido"}</div>
                  </div>
                </div>

                <div>
                  <span className="text-gray-400">ONEDRIVE_CLIENT_SECRET:</span>{" "}
                  <span className={diagnostics.clientSecret.trimmedLength > 10 ? "text-emerald-400" : "text-rose-400"}>
                    {diagnostics.clientSecret.censored}
                  </span>
                  <div className="pl-3 text-[10px] text-gray-400 mt-0.5">
                    • Status: {diagnostics.clientSecret.trimmedLength > 0 ? `✅ Configurado (${diagnostics.clientSecret.trimmedLength} caracteres)` : "❌ Vazio"}
                  </div>
                </div>

                <div>
                  <span className="text-gray-400">ONEDRIVE_TENANT:</span>{" "}
                  <span className="text-emerald-400 font-bold">
                    {diagnostics.tenant || "common"}
                  </span>
                  <div className="pl-3 text-[10px] text-gray-400 mt-0.5">
                    • Status: {diagnostics.tenant === "common" ? "ℹ️ Padrão Comum (Multilocatário e pessoal)" : `✅ Customizado (${diagnostics.tenant})`}
                  </div>
                </div>

                <div>
                  <span className="text-gray-400">APP_URL (Configurado):</span>{" "}
                  <span className="text-indigo-300">{diagnostics.appUrlFromEnv}</span>
                </div>

                <div>
                  <span className="text-gray-400">Gerado Automaticamente:</span>{" "}
                  <span className="text-indigo-300">{diagnostics.dynamicBaseUrl}</span>
                </div>

                <div className="border-t border-slate-800 pt-2 mt-2 space-y-1 text-xs">
                  <span className="text-indigo-300">💡 URI de Redirecionamento Final (Enviado para a Microsoft):</span>
                  <div className="bg-slate-950 p-2 rounded text-[#a5b4fc] break-all select-all font-bold mt-1 text-[11px]">
                    {diagnostics.finalRedirectUri}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 leading-normal italic">
                    ⚠️ Atenção: O link acima DEVE ser copiado e colado exatamente idêntico no campo <strong>URI de redirecionamento</strong> plataforma <strong>Web</strong> na sua tela do Azure AD.
                  </p>
                </div>

                <div className="bg-slate-950/50 p-2.5 rounded border border-slate-800 space-y-1 text-[10px] leading-relaxed">
                  <div className="font-bold text-gray-300">Análise de Erros Comuns:</div>
                  <div className={`${diagnostics.advice.lengthCheck.includes("⚠️") ? "text-amber-400 font-bold" : "text-emerald-400"}`}>{diagnostics.advice.lengthCheck}</div>
                  <div className={`${diagnostics.advice.mismatch.includes("⚠️") ? "text-amber-400 font-bold" : "text-emerald-400"}`}>{diagnostics.advice.mismatch}</div>
                </div>
              </div>
            ) : (
              <span className="text-rose-400">Não foi possível recuperar os dados de diagnóstico do backend. Tente reiniciar o servidor de desenvolvimento.</span>
            )}
          </div>
          
          {/* FORMULÁRIO DE CONFIGURAÇÃO DE CREDENCIAIS (FIRESTORE) */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
            <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <span>⚙️ Registrar Credenciais do OneDrive no Firebase</span>
            </h5>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Como o Vercel hospeda o aplicativo de forma estática (SPA), você pode registrar as chaves do seu aplicativo do Azure AD de forma segura na coleção do Firebase para carregar o OneDrive e a API do Microsoft Graph diretamente pelo seu navegador!
            </p>
            <form onSubmit={handleSaveConfig} className="space-y-3 text-[11px]">
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700">ID de Aplicativo (Client ID) do Azure:</label>
                <input 
                  type="text" 
                  value={configClientId}
                  onChange={(e) => setConfigClientId(e.target.value)}
                  placeholder="Ex: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700">Valor do Segredo (Client Secret) - Opcional:</label>
                <input 
                  type="password" 
                  value={configClientSecret}
                  onChange={(e) => setConfigClientSecret(e.target.value)}
                  placeholder="Insira o valor do segredo para sincronização híbrida"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700">ID do Tenant (Azure Directory Tenant ID):</label>
                <input 
                  type="text" 
                  value={configTenant}
                  onChange={(e) => setConfigTenant(e.target.value)}
                  placeholder="Ex: common, organizations, ou o ID do diretório (Guid)"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">
                  Utilize <strong>common</strong> para contas multilocatárias/pessoais (padrão), ou insira o ID específico do diretório (UUID) para contas corporativas restritas de sua instituição.
                </p>
              </div>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-[0.98] cursor-pointer"
                >
                  {savingConfig ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Salvar no Firebase</span>
                  )}
                </button>
                {saveSuccess && (
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    <Check size={13} />
                    Salvo com sucesso!
                  </span>
                )}
              </div>
            </form>
          </div>
          
          <div className="p-4 bg-amber-50/70 border border-amber-100 rounded-xl space-y-3">
            <p className="font-medium text-amber-900">
              O erro <code className="font-bold text-rose-600">invalid_request</code> ou <code className="font-bold text-rose-600">unauthorized_client</code> do Microsoft login geralmente ocorre por dois motivos principais:
            </p>
            <ol className="list-decimal pl-4 space-y-1.5 text-amber-800">
              <li>
                <strong>URI de redirecionamento incorreta no Azure:</strong> O link que você registrou no Azure AD deve coincidir exatamente, caractere por caractere, com o valor que o botão envia. Use o link do bloco abaixo e atualize seu registro do Azure.
              </li>
              <li>
                <strong>Tenant incorreto / Falta de suporte a contas pessoais:</strong> Se você está tentando entrar com uma conta de e-mail comum (como <code>@outlook.com</code>, <code>@hotmail.com</code> ou Live ID), ao cadastrar o App no Azure AD você <strong>DEVE</strong> ter selecionado a opção de tipo de conta: <br />
                <span className="font-bold text-amber-950">"Qualquer Diretório ID de Entra + Contas Pessoais" (Multilocatário e pessoal)</span>. Se o App foi criado como "Apenas este diretórios organizacional" (Single tenant), contas pessoais comuns apresentarão erro.
              </li>
            </ol>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="block font-bold text-gray-400 uppercase tracking-widest text-[9px]">1. URL de Redirecionamento Recomendada</span>
              <p className="text-gray-500 text-[11px]">Você deve adicionar este link exatamente como está listado sob a plataforma <strong>Web</strong> nas configurações de autenticação do seu App no Azure:</p>
              
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 p-2 rounded-lg font-mono text-[10px] text-gray-700">
                <span className="truncate flex-1">{getRedirectUri()}</span>
                <button 
                  onClick={copyToClipboard}
                  className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded text-gray-500 hover:text-black transition-colors"
                  title="Copiar URL"
                >
                  {copied ? <CheckCircle2 size={13} className="text-emerald-600" /> : <Copy size={13} />}
                </button>
              </div>
              {copied && <p className="text-[10px] text-emerald-600 font-semibold">Copiado para a área de transferência com sucesso!</p>}
            </div>

            <div className="space-y-2">
              <span className="block font-bold text-gray-400 uppercase tracking-widest text-[9px]">2. Links Úteis do Dashboard do Azure</span>
              <ul className="space-y-1.5">
                <li>
                  <a 
                    href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-blue-600 hover:underline font-medium flex items-center gap-1"
                  >
                    <span>Registros de Aplicativos (Azure Portal)</span>
                    <ExternalLink size={12} />
                  </a>
                </li>
                <li>
                  <a 
                    href="https://go.microsoft.com/fwlink/?linkid=2083908" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-blue-600 hover:underline font-medium flex items-center gap-1"
                  >
                    <span>Criar Novo Registro do Azure AD</span>
                    <ExternalLink size={12} />
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl space-y-2.5">
            <span className="block font-bold text-gray-700 uppercase tracking-widest text-[9px]">Resumo do Checklist no Azure AD:</span>
            <ul className="list-disc pl-4 space-y-1 text-gray-600 text-[11px]">
              <li>No painel do Azure, vá em <strong>Registros de aplicativo</strong> (App Registrations).</li>
              <li>Ao criar, selecione <strong>Tipos de conta com suporte:</strong> Multilocatário + Contas pessoais da Microsoft.</li>
              <li>Em <strong>Autenticação</strong>, adicione uma plataforma <strong>Web</strong> e insira a URI de Redirecionamento mostrada acima.</li>
              <li>Em <strong>Certificados e segredos</strong>, crie um novo Segredo do Cliente e copie o <strong>VALOR</strong> (não ID).</li>
              <li>No AI Studio (no topo da tela em <code>Settings &gt; Environment Variables</code>), configure:
                <ul className="list-none pl-2.5 mt-1 space-y-0.5 text-gray-700 font-mono text-[10px]">
                  <li>• <code className="bg-gray-200 px-1 rounded font-bold">ONEDRIVE_CLIENT_ID</code> = ID de Aplicativo (ex: xxxxxxxx-...-xxxxxxxxxxxx)</li>
                  <li>• <code className="bg-gray-200 px-1 rounded font-bold">ONEDRIVE_CLIENT_SECRET</code> = Valor do segredo gerado (não o ID do segredo)</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

