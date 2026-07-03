# Tecnologias Utilizadas no Sistema GestiPrev

Este documento apresenta uma descrição técnica detalhada de todas as linguagens, frameworks, bibliotecas, bancos de dados e ferramentas utilizadas no desenvolvimento do **GestiPrev - Controle de Pagamentos - GRCP**.

---

## 🏗️ 1. Arquitetura do Sistema

O sistema é estruturado como uma aplicação **Full-Stack moderna** de alta performance:
- **Frontend**: Single Page Application (SPA) construída com React, TypeScript e Tailwind CSS.
- **Backend**: Servidor corporativo construído em Node.js usando o framework Express, servindo tanto as APIs REST quanto intermediando a segurança e integrações externas (como Microsoft OneDrive).

---

## 💻 2. Tecnologias e Linguagens Principais

### **TypeScript**
- **O que é**: Um superconjunto de JavaScript que adiciona tipagem estática opcional ao código.
- **Utilização**: Utilizado em 100% da aplicação (tanto no cliente quanto no servidor) para garantir segurança contra bugs de execução, autocompletar eficiente no código e facilidade de manutenção a longo prazo.

### **React (v19)**
- **O que é**: A biblioteca JavaScript mais popular do mercado para construção de interfaces de usuário dinâmicas.
- **Utilização**: Estruturação completa da interface do GestiPrev baseada em componentes funcionais modernos e Hooks personalizados para controle de estado.

### **Node.js & Express**
- **O que é**: Ambiente de execução JavaScript do lado do servidor combinado com o framework web minimalista Express.
- **Utilização**: Gerenciamento de rotas de API, proxy seguro para ocultar chaves de acesso sigilosas e controle do fluxo de autenticação e comunicação com as APIs da Microsoft.

---

## 🗄️ 3. Banco de Dados e Segurança

### **Firebase Firestore**
- **O que é**: Um banco de dados de documentos NoSQL flexível e altamente escalável hospedado na nuvem da Google Cloud Platform (GCP).
- **Utilização**: Armazenamento e sincronização em tempo real de todas as entidades críticas do sistema, tais como:
  - **Secretarias**: Cadastro de órgãos monitorados (Ex: Secretaria de Educação).
  - **Departamentos**: Divisões internas para segmentação de guias.
  - **Guias de Pagamento (GRCP)**: Informações de vencimento, valores patronais e de segurados.
  - **Comprovantes**: Histórico e vinculação de PDFs de pagamento.
  - **Perfis de Usuários**: Níveis de permissão e dados de acesso.

### **Firebase Authentication**
- **O que é**: Serviço completo de gerenciamento de identidades e login seguro.
- **Utilização**: Login dos administradores e consultores do IPME utilizando e-mail institucional/senha e login simplificado através da Conta do Google.

---

## ☁️ 4. Integrações de Armazenamento e Serviços Externos

### **Microsoft OneDrive & Microsoft Graph API**
- **O que é**: Integração direta com a nuvem corporativa da Microsoft.
- **Utilização**: Permite que o sistema acesse pastas compartilhadas do OneDrive, liste PDFs de guias e comprovantes, faça downloads e associe de maneira automatizada arquivos de prestação de contas aos departamentos correspondentes de forma transparente para o usuário.

---

## 🎨 5. Design, Estilização e Animações

### **Tailwind CSS (v4)**
- **O que é**: Framework utilitário de estilização CSS focado em velocidade e design uniforme.
- **Utilização**: Estilização visual limpa e de alto contraste em toda a interface do usuário (UI), totalmente responsiva para funcionar perfeitamente em computadores, tablets e smartphones.

### **Motion (Framer Motion)**
- **O que é**: Biblioteca de animações declarativa para React.
- **Utilização**: Transições de telas suaves, efeitos de carregamento visuais elegantes e feedbacks dinâmicos de hover e clique que enriquecem a experiência do usuário.

### **Lucide React**
- **O que é**: Coleção moderna e consistente de ícones vetoriais SVG.
- **Utilização**: Representações visuais de botões, abas, ações e status no painel administrativo.

---

## 📊 6. Análise de Dados e Relatórios

### **Recharts**
- **O que é**: Biblioteca de gráficos interativos construída sobre componentes React.
- **Utilização**: Geração de gráficos visuais de balanço, monitoramento de guias pagas/pendentes na tela de Visão Geral (Dashboard) e relatórios de conformidade.

---

## ⚙️ 7. Ferramental de Desenvolvimento e Compilação (Build System)

- **Vite (v6)**: Ferramenta de build de última geração que substitui os compiladores tradicionais, proporcionando carregamento quase instantâneo do projeto em desenvolvimento.
- **Esbuild**: Compilador extremamente veloz escrito em Go, utilizado na build de produção para empacotar todo o servidor backend TypeScript em um único módulo otimizado (`dist/server.cjs`).
- **tsx**: Executor direto e de alto desempenho de TypeScript no Node.js para o ambiente de desenvolvimento.
