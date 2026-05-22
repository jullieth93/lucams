-- Agregar AVEONLINE al enum WebhookSource (P1.4 dossier §17 — webhook tracking updates).
ALTER TYPE "WebhookSource" ADD VALUE IF NOT EXISTS 'AVEONLINE';
