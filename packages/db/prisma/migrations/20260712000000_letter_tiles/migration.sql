-- ADR-057 — Sets de fichas del abecedario (LetterTileSet + LetterTile)
-- Generado con migrate diff desde la DB real (el shadow DB falla por pg_trgm).

CREATE TABLE "LetterTileSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "LetterTileSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterTile" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "char" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "label" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterTile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LetterTileSet_language_isActive_isDefault_idx" ON "LetterTileSet"("language", "isActive", "isDefault");

-- CreateIndex
CREATE INDEX "LetterTile_setId_order_idx" ON "LetterTile"("setId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "LetterTile_setId_char_key" ON "LetterTile"("setId", "char");

-- AddForeignKey
ALTER TABLE "LetterTile" ADD CONSTRAINT "LetterTile_setId_fkey" FOREIGN KEY ("setId") REFERENCES "LetterTileSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

