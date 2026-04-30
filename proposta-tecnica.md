# Proposta Técnica - GestiPrev

## 1. Arquitetura de Solução

### Frontend
- **Framework:** React 19 (Vite)
- **Estilização:** Tailwind CSS (Moderno, Responsivo)
- **Animações:** Framer Motion (Transições suaves e feedback visual)
- **Gráficos:** Recharts (KPIs e Dashboards)
- **Ícones:** Lucide React

### Backend (Serverless)
- **Firebase Authentication:** Gestão de usuários e controle de acesso (Login Google).
- **Cloud Firestore:** Banco de dados NoSQL para escalabilidade e tempo real.
- **Cloud Storage:** Armazenamento de arquivos PDF/Imagens (Guias e Comprovantes).

### Segurança e Controle
- **Role-Based Access Control (RBAC):** Hierarquia de Admin, Secretaria e Departamento implementada via Firestore Security Rules.
- **Validação de Dados:** Regras estritas no banco para garantir integridade e prevenir ataques de "denial of wallet".

## 2. Modelo de Dados (Firestore)

### Coleções Principais
- `secretarias`: Nome, sigla, metadados.
- `departamentos`: Nome, vinculo com secretaria.
- `guias`: Referência ao departamento, mês/ano, valor, vencimento, status (pendente/pago), link para PDF.
- `comprovantes`: Referência à guia, data de pagamento, valor pago, link para arquivo.
- `usuarios`: Nome, e-mail, cargo, vinculação hierárquica.

## 3. Dashboard e KPIs
O painel visual apresentará:
- **Status Geral:** Percentual de guias pagas vs. pendentes no mês atual.
- **Volume por Secretaria:** Distribuição monetária das obrigações previdenciárias.
- **Alertas de Atraso:** Listagem prioritária de guias vencidas não comprovadas.
- **Histórico Mensal:** Gráfico de evolução de pagamentos ao longo do ano.

## 4. Fluxo do Usuário
1. **Autenticação:** Login via Google.
2. **Navegação:** Escolha da Secretaria -> Departamento ou visualização direta do Dashboard (dependendo do nível de acesso).
3. **Gestão:**
   - Upload de Guia: Registro dos dados financeiros e anexo do documento.
   - Consulta: Busca por período ou status.
   - Upload de Comprovante: Vinculação direta à guia correspondente, atualizando o status para "Pago".

---
*Este documento serve como diretriz técnica para o desenvolvimento do MVP (Minimum Viable Product).*

## 5. Diferenciais da Solução
- **Escalabilidade:** Como utilizamos Firebase, o sistema escala automaticamente de acordo com o número de secretarias.
- **Custo Zero Inicial:** O uso do Spark Plan permite o desenvolvimento e operação inicial sem custos de infraestrutura.
- **Segurança Nativa:** Validações diretamente no banco de dados garantem que apenas usuários autorizados acessem documentos sensíveis.
- **Tempo Real:** Atualizações no dashboard refletem instantaneamente quando um comprovante é anexado em qualquer departamento.
