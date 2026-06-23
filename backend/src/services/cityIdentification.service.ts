import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';

const prisma = new PrismaClient();
const anthropic = new Anthropic();

export class CityIdentificationService {
  /**
   * Identifica a cidade baseado na resposta do usuário
   * Usa IA para fazer matching fuzzy com as cidades cadastradas
   */
  async identifyCity(userAnswer: string): Promise<{ cityId: string; cityName: string } | null> {
    try {
      // Busca todas as cidades ativas
      const cities = await prisma.city.findMany({
        where: { active: true },
        select: { id: true, name: true, state: true },
      });

      if (cities.length === 0) {
        return null;
      }

      // Cria um prompt para a IA identificar a cidade
      const citiesList = cities.map((c) => `${c.name} (${c.state})`).join(', ');

      const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: `O usuário respondeu: "${userAnswer}"
            
Cidades disponíveis: ${citiesList}

Identifique qual cidade o usuário mencionou. Responda APENAS com o nome exato da cidade (ex: "São Paulo") ou "NENHUMA" se não conseguir identificar.`,
          },
        ],
      });

      const response = message.content[0];
      if (response.type !== 'text') {
        return null;
      }

      const identifiedCityName = response.text.trim();

      if (identifiedCityName === 'NENHUMA') {
        return null;
      }

      // Busca a cidade identificada
      const city = cities.find((c) => c.name.toLowerCase() === identifiedCityName.toLowerCase());

      if (!city) {
        return null;
      }

      return {
        cityId: city.id,
        cityName: city.name,
      };
    } catch (error) {
      console.error('[CityIdentification] Erro ao identificar cidade:', error);
      return null;
    }
  }

  /**
   * Salva a cidade identificada para um contato
   */
  async saveCityForContact(contactId: string, cityId: string, userAnswer: string) {
    try {
      await prisma.studentCity.upsert({
        where: { contactId },
        update: {
          cityId,
          cityAnswer: userAnswer,
          status: 'identified',
        },
        create: {
          contactId,
          cityId,
          cityAnswer: userAnswer,
          status: 'identified',
        },
      });
    } catch (error) {
      console.error('[CityIdentification] Erro ao salvar cidade do contato:', error);
    }
  }

  /**
   * Obtém a resposta personalizada para uma cidade
   */
  async getCityResponse(cityId: string, type: string): Promise<string | null> {
    try {
      const response = await prisma.cityResponse.findFirst({
        where: {
          cityId,
          type,
          active: true,
        },
        orderBy: { order: 'asc' },
      });

      return response?.message || null;
    } catch (error) {
      console.error('[CityIdentification] Erro ao buscar resposta da cidade:', error);
      return null;
    }
  }

  /**
   * Obtém a cidade de um contato
   */
  async getContactCity(contactId: string) {
    try {
      const studentCity = await prisma.studentCity.findUnique({
        where: { contactId },
        include: { city: true },
      });

      return studentCity?.city || null;
    } catch (error) {
      console.error('[CityIdentification] Erro ao buscar cidade do contato:', error);
      return null;
    }
  }

  /**
   * Cria cidades padrão no banco
   */
  async seedCities() {
    try {
      const defaultCities = [
        { name: 'São Paulo', state: 'SP' },
        { name: 'Rio de Janeiro', state: 'RJ' },
        { name: 'Belo Horizonte', state: 'MG' },
        { name: 'Brasília', state: 'DF' },
        { name: 'Salvador', state: 'BA' },
        { name: 'Fortaleza', state: 'CE' },
        { name: 'Manaus', state: 'AM' },
        { name: 'Curitiba', state: 'PR' },
        { name: 'Recife', state: 'PE' },
        { name: 'Porto Alegre', state: 'RS' },
      ];

      for (const city of defaultCities) {
        await prisma.city.upsert({
          where: { name: city.name },
          update: {},
          create: city,
        });
      }

      console.log('[CityIdentification] Cidades padrão criadas/atualizadas');
    } catch (error) {
      console.error('[CityIdentification] Erro ao criar cidades padrão:', error);
    }
  }
}

export const cityIdentificationService = new CityIdentificationService();

