import Tesseract from 'tesseract.js';
import path from 'path';

interface RgData {
  nome?: string;
  cpf?: string;
  rg?: string;
  nascimento?: string;
  naturalidade?: string;
  raw?: string;
}

class OcrService {
  /**
   * Extrai dados de um documento RG (Registro Geral) via OCR
   */
  async extractRgData(imagePath: string): Promise<RgData> {
    console.log('[OCR] Processando documento:', imagePath);

    try {
      const { data } = await Tesseract.recognize(imagePath, 'por', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`[OCR] Progresso: ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      const text = data.text;
      const result: RgData = { raw: text };

      // Extrai CPF: padrão 000.000.000-00
      const cpfMatch = text.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
      if (cpfMatch) result.cpf = cpfMatch[1].replace(/[.\-]/g, '');

      // Extrai RG: padrão com números e letras
      const rgMatch = text.match(/(?:RG|R\.G\.|REGISTRO GERAL)[:\s]*([0-9A-Z.\-\/]+)/i);
      if (rgMatch) result.rg = rgMatch[1].trim();

      // Extrai nome (linha após "NOME" ou "Nome:")
      const nomeMatch = text.match(/(?:NOME|Nome)[:\s]+([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÀÈÌÒÙÇ\s]+)/i);
      if (nomeMatch) result.nome = nomeMatch[1].trim().replace(/\s+/g, ' ');

      // Extrai data de nascimento
      const nascMatch = text.match(/(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/);
      if (nascMatch) result.nascimento = nascMatch[1];

      // Extrai naturalidade
      const natMatch = text.match(/(?:NATURAL(?:IDADE)?|Naturalidade)[:\s]+([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÀÈÌÒÙÇ\s\-]+)/i);
      if (natMatch) result.naturalidade = natMatch[1].trim().split('\n')[0];

      console.log('[OCR] Dados extraídos:', result);
      return result;
    } catch (err: any) {
      console.error('[OCR] Erro:', err.message);
      throw new Error(`Falha ao processar documento: ${err.message}`);
    }
  }

  /**
   * Extrai texto livre de qualquer imagem
   */
  async extractText(imagePath: string, lang = 'por'): Promise<string> {
    const { data } = await Tesseract.recognize(imagePath, lang);
    return data.text;
  }
}

export const ocrService = new OcrService();
