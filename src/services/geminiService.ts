import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export interface ExtractedGuia {
  nome: string;
  valor: number;
  vencimento: string;
  mes: number;
  ano: number;
  tipo: 'patronal' | 'segurado';
  identificacaoGrcp: string;
}

export interface ExtractedComprovante {
  valorPago: number;
  dataPagamento: string;
  identificacaoGrcp: string;
}

const MODEL_NAME = "gemini-3-flash-preview";

export async function extractGuiaData(base64Data: string, mimeType: string, filename?: string): Promise<ExtractedGuia | null> {
  console.group(`AI EXTRACTION: Guia [${filename || 'Untitled'}]`);
  
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: `Você é um robô extrator de dados de GUIA DE RECOLHIMENTO (GRCP) da prefeitura.
              
              ARQUIVO: ${filename || 'Documento PDF'}
              
              INSTRUÇÕES:
              1. Localize o campo de IDENTIFICAÇÃO GRCP. Ele segue o padrão "NNNN/PME-XXX/AAAA" (ex: 0022/PME-PAT/2026). É CRUCIAL extrair este código exatamente.
              2. Determine o TIPO. Se o código for PAT, é 'patronal'. Se for SEG, é 'segurado'. Se não estiver no código mas o nome do arquivo disser "PATRONAL", use 'patronal'.
              3. Extraia o VALOR TOTAL da guia.
              4. Extraia o VENCIMENTO (YYYY-MM-DD).
              5. Extraia o MÊS e ANO de competência.
              6. NOME: Descrição da guia ou departamento.
              
              DICA: O código GRCP geralmente está no topo ou perto do título "Guia de Recolhimento".`,
            },
          ],
        },
      ],
      config: {
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
          required: ["nome", "valor", "vencimento", "mes", "ano", "tipo", "identificacaoGrcp"],
        },
      },
    });

    const text = response.text;
    console.log("AI Result (Guia):", text);
    
    if (text) {
      const data = JSON.parse(text);
      if (data.identificacaoGrcp && data.identificacaoGrcp.length > 5) {
        return data as ExtractedGuia;
      }
    }
    return null;
  } catch (error) {
    console.error("AI Error (Guia):", error);
    return null;
  } finally {
    console.groupEnd();
  }
}

export async function extractComprovanteData(base64Data: string, mimeType: string, filename?: string): Promise<ExtractedComprovante | null> {
  console.group(`AI EXTRACTION: Comprovante [${filename || 'Untitled'}]`);
  
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: `Você é um robô extrator de COMPROVANTES DE PAGAMENTO BANCÁRIO.
              
              ARQUIVO: ${filename || 'Comprovante PDF'}
              
              INSTRUÇÕES:
              1. Localize o VALOR PAGO.
              2. Localize a DATA DO PAGAMENTO (YYYY-MM-DD).
              3. LOCALIZAR VÍNCULO: Procure por qualquer texto que identifique a guia paga. O código GRCP esperado é "NNNN/PME-XXX/AAAA". Às vezes está no campo de identificação, observação ou no corpo do texto. 
              
              IMPORTANTE: Se você não encontrar o código GRCP no texto do comprovante mas o NOME DO ARQUIVO contiver algo como "0022-PME-PAT-2026" ou similar, use essa informação para preencher 'identificacaoGrcp'.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            valorPago: { type: Type.NUMBER },
            dataPagamento: { type: Type.STRING },
            identificacaoGrcp: { type: Type.STRING },
          },
          required: ["valorPago", "dataPagamento", "identificacaoGrcp"],
        },
      },
    });

    const text = response.text;
    console.log("AI Result (Comprovante):", text);
    
    if (text) {
      const data = JSON.parse(text);
      if (data.identificacaoGrcp && data.identificacaoGrcp.length > 5) {
        return data as ExtractedComprovante;
      }
    }
    return null;
  } catch (error) {
    console.error("AI Error (Comprovante):", error);
    return null;
  } finally {
    console.groupEnd();
  }
}
