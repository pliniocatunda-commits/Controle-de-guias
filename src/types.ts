export type UserRole = 'admin' | 'secretaria_admin' | 'departamento_user';

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
