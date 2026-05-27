import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Serviço para upload de arquivos no Firebase Storage.
 * Resolve definitivamente o problema de visualização de PDFs.
 */
export async function uploadFile(file: File, folder: string = 'documentos'): Promise<string> {
  try {
    // Gerar um nome de arquivo único para evitar colisões
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const fileName = `${folder}/${timestamp}_${cleanFileName}`;
    
    const storageRef = ref(storage, fileName);
    
    console.log(`[Firebase Storage] Iniciando upload de ${file.name} para o bucket: ${storage.app.options.storageBucket}...`);
    
    // Upload do arquivo
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type || 'application/pdf' // Fallback para PDF se o tipo estiver vazio
    });
    
    // Obter URL de download pública
    const downloadUrl = await getDownloadURL(snapshot.ref);
    
    console.log(`[Firebase Storage] Upload concluído! URL: ${downloadUrl}`);
    return downloadUrl;
  } catch (error: any) {
    console.error('[Firebase Storage] Erro detalhado no upload:', error);
    
    if (error.code === 'storage/retry-limit-exceeded') {
      throw new Error('Erro de conexão com o Firebase Storage (Timeout). Isso pode ocorrer se o serviço não estiver ativado no projeto ou se houver bloqueio de rede. Tente novamente em instantes.');
    }
    
    if (error.code === 'storage/unauthorized') {
      throw new Error('Sem permissão para upload. Verifique as regras de segurança do Firebase Storage.');
    }

    throw new Error('Falha ao enviar arquivo para o Firebase Storage. Verifique sua conexão ou se o arquivo é muito grande.');
  }
}

/**
 * Função de conveniência para manter compatibilidade com interface antiga se necessário
 */
export const uploadToFirebase = uploadFile;
