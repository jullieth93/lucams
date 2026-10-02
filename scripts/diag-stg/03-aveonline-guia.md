# Fase 0 · Diagnóstico guía Aveonline LCM-2026-0009 (hallazgo 22)

El mensaje "No se pudo generar la guía en la transportadora. Guía Anulada automáticamente."
es la respuesta CRUDA de Aveonline (`features/shipping/aveonline.ts:1100-1120`):
la transportadora rechazó la guía y Aveonline la anuló de su lado.

## 1) Health de la integración en STG

```bash
curl -s https://<URL-STG>/api/health/aveonline | jq
```

Qué buscar:
- `idempresa`: si es `15289` (cuenta DEMO pública), esa es muy probablemente la causa —
  con la cuenta demo la transportadora rechaza guías (cobertura/agentes limitados).
- Modo (sandbox/producción) y si las credenciales son las esperadas para STG.

## 2) Logs de Vercel (STG)

Buscar en los logs del deployment de STG el evento estructurado:

```
shipping.aveonline.createshipment.fail
```

Ese log incluye `msg` (mensaje de Aveonline) y `requestBodySent` (origen, destino,
idtransportador, valorrecaudo, bloquegenerarguia — sin PII). Con eso se sabe si el
rechazo fue por:
- destino sin cobertura de esa transportadora (código -2 / equivalente),
- formato de ciudad inválido (`CIUDAD(DEPTO)` sin tildes, `formatAveonlineCity`),
- rechazo genérico de cuenta demo.

También útil: `order.saga.paid.shipment_failed` para el mismo pedido.

## 3) Datos del pedido (DB STG)

```sql
SELECT number, "shippingCarrier", "shippingCity", "shippingAddress",
       "shippingDepartment", "trackingNumber", "shipmentClaimedAt"
FROM "Order"
WHERE number = 'LCM-2026-0009';
```

Cruzar `shippingCity`/`shippingDepartment` contra el catálogo Aveonline
(formato `CIUDAD(DEPTO)` sin tildes).
