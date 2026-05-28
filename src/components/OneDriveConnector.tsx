import React, { useState, useEffect } from 'react';
import { onedriveService, OneDriveUser } from '../services/onedriveService';
import { Cloud, Check, Loader2, AlertCircle, HelpCircle, ChevronDown, ChevronUp, ExternalLink, Copy, CheckCircle2 } from 'lucide-react';

export default function OneDriveConnector() {
  const [user, setUser] = useState<OneDriveUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);

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
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (showHelp) {
      loadDiagnostics();
    }
  }, [showHelp]);

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
    if (window.location.hostname.includes('vercel.app')) {
      setError("Você está acessando a aplicação via Vercel (controle-de-guias.vercel.app). Como o Vercel hospeda o aplicativo de forma 100% estática (SPA), o servidor Express que executa a troca segura de tokens com a Microsoft não está ativo neste domínio. Por favor, acesse o aplicativo através do link oficial publicado no Cloud Run onde todos os recursos do backend estão funcionando perfeitamente.");
      setShowHelp(true);
      return;
    }
    try {
      const url = await onedriveService.getAuthUrl();
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      window.open(url, 'onedrive_auth', `width=${width},height=${height},left=${left},top=${top}`);
    } catch (err: any) {
      setError(err.message || "Não foi possível iniciar a conexão com o OneDrive.");
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
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2 leading-relaxed">
          <div className="flex items-center gap-2 font-bold text-amber-950">
            <AlertCircle size={16} className="text-amber-500 shrink-0" />
            <span>Servidor Backend Inativo neste Domínio (Vercel)</span>
          </div>
          <p>
            Você está acessando o sistema pelo domínio do Vercel (<code>controle-de-guias.vercel.app</code>). Este projeto possui recursos **Full-Stack** (com rotas de servidor seguras para o login do OneDrive e extração de guias com IA) que exigem o backend ativo no <strong>Google Cloud Run</strong>.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 pt-1 items-start sm:items-center">
            <span className="font-semibold text-amber-950">Utilize a página publicada oficial:</span>
            <a 
              href="https://ais-pre-p6vyxxn7s22aps5bevzc2w-534607352231.us-east1.run.app"
              className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors inline-flex"
            >
              Ir para Página Publicada (Cloud Run) <ExternalLink size={11} />
            </a>
          </div>
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
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="p-2 text-gray-400 hover:text-black hover:bg-gray-50 rounded-lg transition-colors"
            title="Ajuda e Instruções de Configuração"
          >
            <HelpCircle size={18} />
          </button>
          
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

