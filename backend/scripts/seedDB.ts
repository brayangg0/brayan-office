// Script para popular banco com dados de exemplo (seedDB.ts)
// Execute: npx ts-node backend/scripts/seedDB.ts

import { prisma } from '../src/services/database';
import process from 'process';

async function seed() {
  console.log('🌱 Iniciando seed...');

  try {
    // 1. Criar usuário admin
    const user = await prisma.user.upsert({
      where: { email: 'admin@crm.local' },
      update: {},
      create: {
        name: 'Admin',
        email: 'admin@crm.local',
        password: 'admin123', // MUDE ISSO EM PRODUÇÃO!
        role: 'admin',
      }
    });
    console.log('✅ Usuário criado');

    // 2. Criar cursos
    const courses = await Promise.all([
      prisma.course.upsert({
        where: { id: 'python' },
        update: {},
        create: {
          id: 'python',
          name: 'Python Avançado',
          description: 'Curso completo de Python com 40 horas',
          duration: 40,
          price: 99.90,
        }
      }),
      prisma.course.upsert({
        where: { id: 'javascript' },
        update: {},
        create: {
          id: 'javascript',
          name: 'JavaScript Moderno',
          description: 'Aprenda JavaScript com React',
          duration: 50,
          price: 129.90,
        }
      }),
    ]);
    console.log('✅ Cursos criados');

    // 3. Criar templates de autorresponse
    const templates = await Promise.all([
      prisma.messageTemplate.upsert({
        where: { id: 'template-horario' },
        update: {},
        create: {
          id: 'template-horario',
          name: 'Horário do Curso',
          type: 'text',
          body: 'Oi {{nome}}!\nNosso curso começará em breve às 19h00 (horário de Brasília).\nVocê receberá o link de acesso em breve.\nAlguma dúvida?',
          variables: JSON.stringify(['nome']),
        }
      }),
      prisma.messageTemplate.upsert({
        where: { id: 'template-duracao' },
        update: {},
        create: {
          id: 'template-duracao',
          name: 'Duração do Curso',
          type: 'text',
          body: 'Duração: 40 horas\nVocê aprende no seu tempo!\n⏱️ Acesso vitalício ao material',
          variables: JSON.stringify([]),
        }
      }),
      prisma.messageTemplate.upsert({
        where: { id: 'template-preco' },
        update: {},
        create: {
          id: 'template-preco',
          name: 'Preço',
          type: 'text',
          body: 'Nossos cursos começam em R$ 99,90\n💰 Parcelamos em até 12x\n📞 Fale conosco para oferta especial!',
          variables: JSON.stringify([]),
        }
      }),
      prisma.messageTemplate.upsert({
        where: { id: 'template-bemvindo' },
        update: {},
        create: {
          id: 'template-bemvindo',
          name: 'Bem-vindo',
          type: 'text',
          body: 'Bem-vindo {{nome}}! 🎉\n\nAqui você aprenderá com especialistas.\n\n📚 Dúvidas sobre:\n• Horários\n• Duração\n• Preço\n• Inscrição\n\nComo posso ajudar?',
          variables: JSON.stringify(['nome']),
        }
      }),
    ]);
    console.log('✅ Templates criados');

    // 4. Criar contatos de exemplo
    const contacts = await Promise.all([
      prisma.contact.upsert({
        where: { phone: '5511999999999' },
        update: {},
        create: {
          name: 'João Silva',
          phone: '5511999999999',
          email: 'joao@email.com',
          status: 'active',
          tags: JSON.stringify(['python', 'iniciante']),
        }
      }),
      prisma.contact.upsert({
        where: { phone: '5521988888888' },
        update: {},
        create: {
          name: 'Maria Santos',
          phone: '5521988888888',
          email: 'maria@email.com',
          status: 'active',
          tags: JSON.stringify(['javascript', 'avançado']),
        }
      }),
    ]);
    console.log('✅ Contatos criados');

    // 5. Criar alunos vinculados
    for (const contact of contacts) {
      await prisma.student.upsert({
        where: { contactId: contact.id },
        update: {},
        create: {
          contactId: contact.id,
          courseId: courses[0].id,
          status: 'active',
          enrolledAt: new Date(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 ano
        }
      });
    }
    console.log('✅ Alunos criados');

    console.log('\n🎉 Seed completado com sucesso!');
    console.log('\n📝 Dados inseridos:');
    console.log(`   - 1 usuário admin (admin@crm.local)`);
    console.log(`   - 2 cursos`);
    console.log(`   - 4 templates de autorresponse`);
    console.log(`   - 2 contatos + alunos`);

  } catch (error) {
    console.error('❌ Erro ao fazer seed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
