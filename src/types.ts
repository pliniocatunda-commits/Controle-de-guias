export type UserRole = 'master' | 'admin' | 'consulta';

export interface Secretaria {
  id: string;
  nome: string;
  sigla: string;
  createdAt: any;
}

export interface Departamento {
  id: string;
  secretariaId: string;
  nome: string;
  onedriveFolderId?: string;
  createdAt: any;
}

export interface Guia {
  id: string;
  departamentoId: string;
  nome?: string;
  mes: number;
  ano: number;
  valor: number;
  valorPago?: number;
  vencimento: string;
  status: 'pendente' | 'pago' | 'atrasado';
  urlGuia?: string;
  urlComprovante?: string;
  tipo: 'patronal' | 'segurado';
  identificacaoGrcp?: string;
  regime?: string;
  createdAt: any;
}

export interface Comprovante {
  id: string;
  guiaId?: string;
  secretariaId?: string;
  mes?: number;
  ano?: number;
  dataPagamento: string;
  valorPago: number;
  urlComprovante: string;
  urlOriginal?: string;
  regime?: string;
  observacoes?: string;
  createdAt: any;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  secretariaId?: string;
  departamentoId?: string;
  createdAt: any;
}
