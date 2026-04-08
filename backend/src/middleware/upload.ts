import multer from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import { Request } from 'express';

const ALLOWED_MIME = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  audio: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/mp4'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/mpeg'],
  document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

const ALL_ALLOWED = Object.values(ALLOWED_MIME).flat();

function createStorage(folder: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      const baseUploads = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads');
      const uploadPath = path.join(baseUploads, folder);
      
      // Criar pasta se não existir
      try {
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
          console.log(`[Upload] 📁 Pasta criada: ${uploadPath}`);
        }
        cb(null, uploadPath);
      } catch (err) {
        console.error(`[Upload] ❌ Erro ao criar pasta ${uploadPath}:`, err);
        cb(err as Error, uploadPath);
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuid()}${ext}`);
    },
  });
}

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (ALL_ALLOWED.includes(file.mimetype)) cb(null, true);
  else cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`));
}

export const uploadMedia = multer({
  storage: createStorage('media'),
  fileFilter,
  limits: { fileSize: 64 * 1024 * 1024 }, // 64MB
});

export const uploadRg = multer({
  storage: createStorage('rg'),
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.image.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Apenas imagens são aceitas para RG'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export const uploadTemp = multer({
  storage: createStorage('temp'),
  fileFilter,
  limits: { fileSize: 64 * 1024 * 1024 },
});
