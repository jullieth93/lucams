"use client";

/*
 * Step 1 — Datos del cliente (Lucy 2026-05-21 — validaciones reales).
 *
 * Validación cliente-side estricta:
 *   - Nombre: solo letras + capitalización al perder foco
 *   - Email: validación formato + autocomplete dominios + detección typos
 *   - Teléfono: 10 dígitos móvil CO con auto-formato "300 887 3826"
 *   - Documento: regex por tipo (CC/CE/NIT/PP/TI)
 *   - Departamento/Ciudad: dropdowns DANE divipola (catálogo curado)
 *   - Código postal: opcional, SIN autocompletado (el CP municipal DANE se
 *     confundía con el número de pedido — fix QA STG 2026-10)
 *   - Localidad (zona del catálogo lib/lucams-zones.ts): obligatoria si la
 *     ciudad está en el catálogo — dato de dirección, no filtro de oferta
 *   - Barrio: texto libre opcional (todas las ciudades)
 *   - Dirección urbana: vía + número + cruce + TIPO DE DESTINO (2026-10,
 *     anti-devoluciones) con campos obligatorios por tipo (apto, torre, casa,
 *     oficina…) — el «Detalle» libre se reemplazó por campos estructurados
 *   - Dirección rural: vereda + finca/negocio/lugar + referencia (mín 20) +
 *     teléfono alternativo en la zona (opcional)
 */

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveDatosAction, type DatosActionState } from "./actions";
import type { CheckoutState } from "@/lib/checkout-session";
import {
  DEPARTMENTS,
  getCitiesByDeptCode,
  getCityByCode,
  type DaneCity,
} from "@/lib/dane-divipola";
import { getZoneCityByCode } from "@/lib/lucams-zones";
import {
  DOCUMENT_TYPE_LABELS,
  capitalizeName,
  cruceNumberError,
  formatPhone,
  getDocumentHelp,
  stripPhone,
  validateDocument,
  validateName,
  validatePhone,
  viaExample,
  viaNumberError,
  type DocumentType,
} from "@/lib/colombia-validators";
import { detectEmailTypo, isValidEmail, suggestEmails } from "@/lib/email-domains";
import { VIA_TYPES, composeDestinationSuffix } from "@/features/checkout/schemas";
import {
  DESTINATION_CONFIG,
  DESTINATION_FIELD_MAX,
  DESTINATION_FIELD_PLACEHOLDERS,
  DESTINATION_GROUPS,
  DESTINATION_REQUIRED_ERRORS,
  RURAL_REF_MIN_LENGTH,
  missingDestinationFields,
  type DestinationField,
  type DestinationType,
} from "@/features/checkout/destination-types";
import { BILLING_DOCUMENT_ENABLED } from "@/features/checkout/billing-document";
import type { CheckoutPrefillAddress } from "@/features/addresses/service";
import type { CheckoutTexts } from "../checkout-texts";

// ─── Feedback de errores (fix QA STG 2026-10: "no pasa nada" al continuar) ───
// Orden de los campos TAL COMO aparecen en el DOM: decide a cuál se hace
// scroll + foco cuando un submit falla (el PRIMERO con error visible). Las
// keys son las de `state.fieldErrors` del server + las de validación cliente.
const ERROR_FIELD_ORDER = [
  "fullName",
  "email",
  "phone",
  "documentNumber",
  "deptCode",
  "cityCode",
  "zip",
  "neighborhood",
  "localityId",
  "viaNumber",
  "cruceNumber",
  "destinationType",
  "apartment",
  "tower",
  "houseNumber",
  "officeNumber",
  "vereda",
  "referencia",
  "altPhone",
  "recipientName",
  "recipientPhone",
  "giftMessage",
  "billingDocumentNumber",
  "billingName",
  "dataConsent",
] as const;
type ErrorFieldKey = (typeof ERROR_FIELD_ORDER)[number];

// id del elemento focusable (input/select/textarea/checkbox) de cada campo.
const ERROR_FIELD_IDS: Record<ErrorFieldKey, string> = {
  fullName: "fullName",
  email: "email",
  phone: "phone-display",
  documentNumber: "contactDocumentNumber",
  deptCode: "deptCode",
  cityCode: "cityCode",
  zip: "zip",
  neighborhood: "neighborhood",
  localityId: "localityId",
  viaNumber: "viaNumber",
  cruceNumber: "cruceNumber",
  destinationType: "destinationType",
  apartment: "apartment",
  tower: "tower",
  houseNumber: "houseNumber",
  officeNumber: "officeNumber",
  vereda: "vereda",
  referencia: "referencia",
  altPhone: "altPhone-display",
  recipientName: "recipientName",
  recipientPhone: "recipientPhone-display",
  giftMessage: "giftMessage",
  billingDocumentNumber: "billingDocumentNumber",
  billingName: "billingName",
  dataConsent: "dataConsent",
};

// Clases de error para los <select>/<textarea> nativos del form (el <Input>
// compartido ya se pinta solo con aria-invalid:border-destructive).
const ERROR_SELECT_CLASSES = "border-rose-400 focus:border-rose-500 focus:ring-rose-200";

// Snapshot de los campos de dirección TAL COMO quedan tras applySavedAddress():
// defaults de resetAddressFields + los valores de la guardada. Se usa para
// comparar contra el estado actual del form — si coinciden, la dirección ES la
// guardada (sin cambios) y "Guardar en mi cuenta" no aplica (ya lo está).
type SavedAddressSnapshot = {
  deptCode: string;
  cityCode: string;
  zip: string;
  localityId: string;
  neighborhood: string;
  kind: "urban" | "rural";
  viaType: string;
  viaNumber: string;
  viaBis: boolean;
  viaCardinal: string;
  cruceNumber: string;
  cruceCardinal: string;
  destinationType: string;
  apartment: string;
  tower: string;
  houseNumber: string;
  blockCode: string;
  complexName: string;
  floor: string;
  buildingName: string;
  officeNumber: string;
  companyName: string;
  referencePoint: string;
  vereda: string;
  finca: string;
  referencia: string;
  altPhone: string;
};

/** Migración visual suave (2026-10): el `detail` libre legacy se muestra como
 *  `referencePoint` cuando la dirección no tiene tipo de destino. La usa tanto
 *  applySavedAddress como el snapshot para que la comparación sea exacta. */
function referencePointFromStructured(s: Record<string, unknown>): string {
  const ref = String(s.referencePoint ?? "");
  if (ref) return ref;
  if (!s.destinationType) return String(s.detail ?? "");
  return "";
}

// Replica EXACTA de la secuencia resetAddressFields()+set* de applySavedAddress.
function snapshotFromSavedAddress(a: CheckoutPrefillAddress): SavedAddressSnapshot {
  const snap: SavedAddressSnapshot = {
    deptCode: "",
    cityCode: "",
    zip: "",
    localityId: "",
    neighborhood: "",
    kind: "urban",
    viaType: "Calle",
    viaNumber: "",
    viaBis: false,
    viaCardinal: "",
    cruceNumber: "",
    cruceCardinal: "",
    destinationType: "",
    apartment: "",
    tower: "",
    houseNumber: "",
    blockCode: "",
    complexName: "",
    floor: "",
    buildingName: "",
    officeNumber: "",
    companyName: "",
    referencePoint: "",
    vereda: "",
    finca: "",
    referencia: "",
    altPhone: "",
  };
  const s = a.structured;
  if (s) {
    snap.deptCode = String(s.deptCode ?? "");
    snap.cityCode = String(s.cityCode ?? "");
    snap.zip = String(s.zip ?? "");
    snap.localityId = String(s.localityId ?? "");
    snap.neighborhood = String(s.neighborhood ?? "");
    snap.kind = s.kind === "rural" ? "rural" : "urban";
    if (snap.kind === "urban") {
      snap.viaType = String(s.viaType ?? "Calle") || "Calle";
      snap.viaNumber = String(s.viaNumber ?? "");
      snap.viaBis = Boolean(s.viaBis);
      snap.viaCardinal = String(s.viaCardinal ?? "");
      snap.cruceNumber = String(s.cruceNumber ?? "");
      snap.cruceCardinal = String(s.cruceCardinal ?? "");
      snap.destinationType = String(s.destinationType ?? "");
      snap.apartment = String(s.apartment ?? "");
      snap.tower = String(s.tower ?? "");
      snap.houseNumber = String(s.houseNumber ?? "");
      snap.blockCode = String(s.blockCode ?? "");
      snap.complexName = String(s.complexName ?? "");
      snap.floor = String(s.floor ?? "");
      snap.buildingName = String(s.buildingName ?? "");
      snap.officeNumber = String(s.officeNumber ?? "");
      snap.companyName = String(s.companyName ?? "");
      snap.referencePoint = referencePointFromStructured(s);
    } else {
      snap.vereda = String(s.vereda ?? "");
      snap.finca = String(s.finca ?? "");
      snap.referencia = String(s.referencia ?? "");
      snap.altPhone = String(s.altPhone ?? "");
    }
  } else {
    // Legacy (sin structured): solo se aplican depto/ciudad/CP.
    if (a.deptCode) snap.deptCode = a.deptCode;
    if (a.cityCode) snap.cityCode = a.cityCode;
    if (a.zip) snap.zip = a.zip;
  }
  return snap;
}

export function DatosForm({
  initial,
  savedAddresses = [],
  canSaveAddress = false,
  texts,
}: {
  initial: CheckoutState;
  savedAddresses?: CheckoutPrefillAddress[];
  // true solo si hay cliente logueado → ofrecer "guardar esta dirección".
  canSaveAddress?: boolean;
  /** Textos CMS del formulario (roadmap B8) — los resuelve el padre server. */
  texts: CheckoutTexts["datos"];
}) {
  const [state, formAction, pending] = useActionState<DatosActionState | null, FormData>(
    saveDatosAction,
    null,
  );

  // Estado local de cada campo con validación reactiva
  const [fullName, setFullName] = useState(initial.contact?.fullName ?? "");
  const [email, setEmail] = useState(initial.contact?.email ?? "");
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [emailTypoFix, setEmailTypoFix] = useState<string | null>(null);
  const [phoneDisplay, setPhoneDisplay] = useState(
    initial.contact?.phone ? formatPhone(initial.contact.phone) : "",
  );
  const [docType, setDocType] = useState<DocumentType | "">(initial.contact?.documentType ?? "");
  const [docNumber, setDocNumber] = useState(initial.contact?.documentNumber ?? "");

  // #26 — "reward early, punish late": el error de validación cliente aparece solo tras el primer
  // blur del campo (touched) y se oculta al reeditar. Evita el rojo prematuro mientras se escribe.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const markTouched = (f: string) => setTouched((t) => ({ ...t, [f]: true }));
  const clearTouched = (f: string) => setTouched((t) => (t[f] ? { ...t, [f]: false } : t));

  // Address DANE
  const [deptCode, setDeptCode] = useState(initial.address?.deptCode ?? "");
  const [cityCode, setCityCode] = useState(initial.address?.cityCode ?? "");
  const [zip, setZip] = useState(initial.address?.zip ?? "");
  // Zona de entrega (localidad/comuna — lib/lucams-zones.ts) — DATO DE DIRECCIÓN:
  // se muestran TODAS las zonas del catálogo y es obligatoria siempre que la
  // ciudad esté en el catálogo, haya o no envío propio activo (las zonas
  // habilitadas en /admin/envios solo deciden si aparece la oferta "Envío
  // Lucams" en el paso de envío).
  const [localityId, setLocalityId] = useState(initial.address?.localityId ?? "");
  const [neighborhood, setNeighborhood] = useState(initial.address?.neighborhood ?? "");
  const zoneCity = getZoneCityByCode(cityCode);
  const showZoneSelect = zoneCity !== null;
  const zoneOptions = zoneCity?.zones ?? [];
  // Discriminated union urbana/rural (Lucy 2026-05-21)
  const [addressKind, setAddressKind] = useState<"urban" | "rural">(
    initial.address?.kind ?? "urban",
  );
  // Urban fields — nomenclatura colombiana completa (Lucy 2026-05-21)
  const [viaType, setViaType] = useState<(typeof VIA_TYPES)[number]>(
    initial.address?.kind === "urban" ? initial.address.viaType : "Calle",
  );
  const [viaNumber, setViaNumber] = useState(
    initial.address?.kind === "urban" ? initial.address.viaNumber : "",
  );
  const [viaBis, setViaBis] = useState<boolean>(
    initial.address?.kind === "urban" ? !!initial.address.viaBis : false,
  );
  const [viaCardinal, setViaCardinal] = useState<string>(
    initial.address?.kind === "urban" ? (initial.address.viaCardinal ?? "") : "",
  );
  const [cruceNumber, setCruceNumber] = useState(
    initial.address?.kind === "urban" ? initial.address.cruceNumber : "",
  );
  const [cruceCardinal, setCruceCardinal] = useState<string>(
    initial.address?.kind === "urban" ? (initial.address.cruceCardinal ?? "") : "",
  );
  // Tipo de destino + campos estructurados por tipo (2026-10, anti-devoluciones).
  // Sin default: el cliente elige siempre (obligatorio en el form). El `detail`
  // libre legacy se migra visualmente a `referencePoint` cuando no hay tipo.
  const [destinationType, setDestinationType] = useState<DestinationType | "">(
    initial.address?.kind === "urban" ? (initial.address.destinationType ?? "") : "",
  );
  // Sub-toggle del conjunto residencial (Torres | Casas) — resuelve al enum
  // conjunto_torres / conjunto_casas del hidden destinationType.
  const [conjuntoSubtype, setConjuntoSubtype] = useState<"torres" | "casas">(
    initial.address?.kind === "urban" && initial.address.destinationType === "conjunto_casas"
      ? "casas"
      : "torres",
  );
  const [apartment, setApartment] = useState(
    initial.address?.kind === "urban" ? (initial.address.apartment ?? "") : "",
  );
  const [tower, setTower] = useState(
    initial.address?.kind === "urban" ? (initial.address.tower ?? "") : "",
  );
  const [houseNumber, setHouseNumber] = useState(
    initial.address?.kind === "urban" ? (initial.address.houseNumber ?? "") : "",
  );
  const [blockCode, setBlockCode] = useState(
    initial.address?.kind === "urban" ? (initial.address.blockCode ?? "") : "",
  );
  const [complexName, setComplexName] = useState(
    initial.address?.kind === "urban" ? (initial.address.complexName ?? "") : "",
  );
  const [floor, setFloor] = useState(
    initial.address?.kind === "urban" ? (initial.address.floor ?? "") : "",
  );
  const [buildingName, setBuildingName] = useState(
    initial.address?.kind === "urban" ? (initial.address.buildingName ?? "") : "",
  );
  const [officeNumber, setOfficeNumber] = useState(
    initial.address?.kind === "urban" ? (initial.address.officeNumber ?? "") : "",
  );
  const [companyName, setCompanyName] = useState(
    initial.address?.kind === "urban" ? (initial.address.companyName ?? "") : "",
  );
  const [referencePoint, setReferencePoint] = useState(() => {
    if (initial.address?.kind !== "urban") return "";
    if (initial.address.referencePoint) return initial.address.referencePoint;
    // Migración visual: detail legacy → punto de referencia (solo si no hay tipo).
    if (!initial.address.destinationType) return initial.address.detail ?? "";
    return "";
  });
  // Rural fields
  const [vereda, setVereda] = useState(
    initial.address?.kind === "rural" ? initial.address.vereda : "",
  );
  const [finca, setFinca] = useState(
    initial.address?.kind === "rural" ? (initial.address.finca ?? "") : "",
  );
  const [referencia, setReferencia] = useState(
    initial.address?.kind === "rural" ? initial.address.referencia : "",
  );
  // Teléfono alternativo en la zona (rural, 2026-10) — display con formato,
  // el hidden lleva los 10 dígitos (mismo patrón del teléfono de contacto).
  const [altPhoneDisplay, setAltPhoneDisplay] = useState(
    initial.address?.kind === "rural" && initial.address.altPhone
      ? formatPhone(initial.address.altPhone)
      : "",
  );
  const [notes, setNotes] = useState(initial.address?.notes ?? "");

  // Preview live de cómo se verá la dirección en la guía del courier — usa el
  // MISMO compositor del server (composeDestinationSuffix) para que la línea
  // sea idéntica a la que recibe Aveonline.
  const addressPreview = useMemo(() => {
    if (addressKind === "urban") {
      if (!viaNumber || !cruceNumber) return "";
      const viaParts = [viaType, viaNumber.toUpperCase()];
      if (viaBis) viaParts.push("Bis");
      if (viaCardinal) viaParts.push(viaCardinal);
      const cruceParts = ["#", cruceNumber.toUpperCase()];
      if (cruceCardinal) cruceParts.push(cruceCardinal);
      const base = `${viaParts.join(" ")} ${cruceParts.join(" ")}`;
      const suffix = composeDestinationSuffix({
        apartment,
        tower,
        houseNumber,
        blockCode,
        complexName,
        floor,
        buildingName,
        officeNumber,
        companyName,
        referencePoint,
      });
      return suffix ? `${base} (${suffix})` : base;
    }
    if (!vereda) return "";
    const parts: string[] = [`Vereda ${vereda}`];
    if (finca.trim()) parts.push(`Finca ${finca.trim()}`);
    if (referencia.trim()) parts.push(`Ref: ${referencia.trim()}`);
    const altPhone = stripPhone(altPhoneDisplay);
    if (altPhone) parts.push(`Tel. zona: ${altPhone}`);
    return parts.join(" · ");
  }, [
    addressKind,
    viaType,
    viaNumber,
    viaBis,
    viaCardinal,
    cruceNumber,
    cruceCardinal,
    apartment,
    tower,
    houseNumber,
    blockCode,
    complexName,
    floor,
    buildingName,
    officeNumber,
    companyName,
    referencePoint,
    vereda,
    finca,
    referencia,
    altPhoneDisplay,
  ]);

  // Billing
  const [wantsInvoice, setWantsInvoice] = useState<boolean>(initial.billing?.wantsInvoice ?? false);
  const [billingDocType, setBillingDocType] = useState<"CC" | "CE" | "NIT" | "PP">(
    initial.billing?.documentType ?? "NIT",
  );
  const [billingDocNumber, setBillingDocNumber] = useState(initial.billing?.documentNumber ?? "");
  const [billingName, setBillingName] = useState(initial.billing?.name ?? "");
  // Autorización de tratamiento de datos (Ley 1581) — obligatoria antes de guardar la PII.
  const [dataConsent, setDataConsent] = useState<boolean>(false);

  // "Guardar esta dirección en mi cuenta" (opt-in, solo clientes logueados).
  const [saveToAccount, setSaveToAccount] = useState(false);
  // id de la dirección guardada aplicada al form (null = diligenciamiento manual).
  // Mientras los campos coincidan con ella, "Guardar en mi cuenta" va deshabilitado.
  const [appliedSavedId, setAppliedSavedId] = useState<string | null>(null);

  // FLUJO REGALO — "compro yo, lo recibe otra persona": toggle de destinatario
  // distinto (nombre + teléfono van a la guía) + checkbox "Es un regalo" con
  // mensaje opcional para la tarjeta. La facturación sigue siendo del comprador.
  const [hasRecipient, setHasRecipient] = useState<boolean>(Boolean(initial.gift));
  const [recipientName, setRecipientName] = useState(initial.gift?.recipientName ?? "");
  const [recipientPhoneDisplay, setRecipientPhoneDisplay] = useState(
    initial.gift?.recipientPhone ? formatPhone(initial.gift.recipientPhone) : "",
  );
  const [isGift, setIsGift] = useState<boolean>(initial.gift?.isGift ?? false);
  const [giftMessage, setGiftMessage] = useState(initial.gift?.giftMessage ?? "");

  // Contador de intentos de submit: los errores de campos OBLIGATORIOS vacíos
  // (tipo de destino, campos por tipo) se muestran solo tras el primer intento
  // ("punish late" — declarado acá porque los errores derivados lo leen).
  const [submitCount, setSubmitCount] = useState(0);

  // Cities filtradas por depto elegido
  const cities = useMemo<DaneCity[]>(
    () => (deptCode ? getCitiesByDeptCode(deptCode) : []),
    [deptCode],
  );
  const selectedDept = useMemo(() => DEPARTMENTS.find((d) => d.code === deptCode), [deptCode]);
  const selectedCity = useMemo(() => getCityByCode(cityCode), [cityCode]);

  // ─── Handlers ───

  // Limpia TODOS los campos de dirección a un estado por defecto. Crítico antes de
  // aplicar una guardada: si no, la calle/tipo previos (de otra selección o tipeo
  // manual) quedan pegados y se enviaría una dirección MEZCLADA (ciudad nueva +
  // calle vieja) que pasa validación silenciosamente (revisión adversarial #1).
  function resetAddressFields() {
    setDeptCode("");
    setCityCode("");
    setZip("");
    setLocalityId("");
    setNeighborhood("");
    setAddressKind("urban");
    setViaType("Calle");
    setViaNumber("");
    setViaBis(false);
    setViaCardinal("");
    setCruceNumber("");
    setCruceCardinal("");
    setDestinationType("");
    setConjuntoSubtype("torres");
    setApartment("");
    setTower("");
    setHouseNumber("");
    setBlockCode("");
    setComplexName("");
    setFloor("");
    setBuildingName("");
    setOfficeNumber("");
    setCompanyName("");
    setReferencePoint("");
    setVereda("");
    setFinca("");
    setReferencia("");
    setAltPhoneDisplay("");
  }

  // Rellena la dirección desde una guardada. Reset primero (estado limpio), luego:
  // structured (form nuevo) → reuso 100%; legacy (sin structured) → solo depto/ciudad/CP.
  function applySavedAddress(id: string) {
    const a = savedAddresses.find((x) => x.id === id);
    if (!a) return;
    resetAddressFields();
    const s = a.structured;
    if (s) {
      setDeptCode(String(s.deptCode ?? ""));
      setCityCode(String(s.cityCode ?? ""));
      setZip(String(s.zip ?? ""));
      setLocalityId(String(s.localityId ?? ""));
      setNeighborhood(String(s.neighborhood ?? ""));
      const kind = s.kind === "rural" ? "rural" : "urban";
      setAddressKind(kind);
      if (kind === "urban") {
        setViaType((String(s.viaType ?? "Calle") as (typeof VIA_TYPES)[number]) || "Calle");
        setViaNumber(String(s.viaNumber ?? ""));
        setViaBis(Boolean(s.viaBis));
        setViaCardinal(String(s.viaCardinal ?? ""));
        setCruceNumber(String(s.cruceNumber ?? ""));
        setCruceCardinal(String(s.cruceCardinal ?? ""));
        const destType = String(s.destinationType ?? "") as DestinationType | "";
        setDestinationType(destType);
        setConjuntoSubtype(destType === "conjunto_casas" ? "casas" : "torres");
        setApartment(String(s.apartment ?? ""));
        setTower(String(s.tower ?? ""));
        setHouseNumber(String(s.houseNumber ?? ""));
        setBlockCode(String(s.blockCode ?? ""));
        setComplexName(String(s.complexName ?? ""));
        setFloor(String(s.floor ?? ""));
        setBuildingName(String(s.buildingName ?? ""));
        setOfficeNumber(String(s.officeNumber ?? ""));
        setCompanyName(String(s.companyName ?? ""));
        setReferencePoint(referencePointFromStructured(s));
      } else {
        setVereda(String(s.vereda ?? ""));
        setFinca(String(s.finca ?? ""));
        setReferencia(String(s.referencia ?? ""));
        setAltPhoneDisplay(s.altPhone ? formatPhone(String(s.altPhone)) : "");
      }
    } else {
      if (a.deptCode) setDeptCode(a.deptCode);
      if (a.cityCode) setCityCode(a.cityCode);
      if (a.zip) setZip(a.zip);
    }
    // La dirección cargada YA está en la cuenta: desmarcar "guardar" y registrar
    // de cuál guardada proviene — el checkbox queda deshabilitado mientras los
    // campos no difieran de ella (savedAddressMatch). Editar cualquier campo lo
    // rehabilita (hay cambios que sí tendría sentido guardar como variante).
    setAppliedSavedId(id);
    setSaveToAccount(false);
  }

  // true cuando la dirección del form coincide EXACTAMENTE con la guardada que
  // se aplicó — comparación campo a campo sobre el snapshot de applySavedAddress.
  const savedAddressMatch = useMemo(() => {
    if (!appliedSavedId) return false;
    const a = savedAddresses.find((x) => x.id === appliedSavedId);
    if (!a) return false;
    const snap = snapshotFromSavedAddress(a);
    if (
      deptCode !== snap.deptCode ||
      cityCode !== snap.cityCode ||
      zip !== snap.zip ||
      localityId !== snap.localityId ||
      neighborhood !== snap.neighborhood ||
      addressKind !== snap.kind
    ) {
      return false;
    }
    if (snap.kind === "urban") {
      return (
        viaType === snap.viaType &&
        viaNumber === snap.viaNumber &&
        viaBis === snap.viaBis &&
        viaCardinal === snap.viaCardinal &&
        cruceNumber === snap.cruceNumber &&
        cruceCardinal === snap.cruceCardinal &&
        destinationType === snap.destinationType &&
        apartment === snap.apartment &&
        tower === snap.tower &&
        houseNumber === snap.houseNumber &&
        blockCode === snap.blockCode &&
        complexName === snap.complexName &&
        floor === snap.floor &&
        buildingName === snap.buildingName &&
        officeNumber === snap.officeNumber &&
        companyName === snap.companyName &&
        referencePoint === snap.referencePoint
      );
    }
    return (
      vereda === snap.vereda &&
      finca === snap.finca &&
      referencia === snap.referencia &&
      stripPhone(altPhoneDisplay) === snap.altPhone
    );
  }, [
    appliedSavedId,
    savedAddresses,
    deptCode,
    cityCode,
    zip,
    localityId,
    neighborhood,
    addressKind,
    viaType,
    viaNumber,
    viaBis,
    viaCardinal,
    cruceNumber,
    cruceCardinal,
    destinationType,
    apartment,
    tower,
    houseNumber,
    blockCode,
    complexName,
    floor,
    buildingName,
    officeNumber,
    companyName,
    referencePoint,
    vereda,
    finca,
    referencia,
    altPhoneDisplay,
  ]);

  function handleNameBlur() {
    if (fullName.trim()) setFullName(capitalizeName(fullName));
    markTouched("fullName");
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    setEmailTypoFix(null);
    clearTouched("email");
    if (value.includes("@") && !value.includes(" ")) {
      const dotIdx = value.indexOf("@") + 1;
      const domainPart = value.slice(dotIdx);
      if (!domainPart.includes(".") || domainPart.endsWith(".")) {
        setEmailSuggestions(suggestEmails(value, 4));
      } else {
        setEmailSuggestions([]);
      }
    } else {
      setEmailSuggestions([]);
    }
  }

  function handleEmailBlur() {
    setEmailSuggestions([]);
    markTouched("email");
    if (email.trim()) {
      const typo = detectEmailTypo(email.trim().toLowerCase());
      setEmailTypoFix(typo);
    }
  }

  function handlePhoneChange(value: string) {
    setPhoneDisplay(formatPhone(value));
    clearTouched("phone");
  }

  function handleDeptChange(newCode: string) {
    setDeptCode(newCode);
    setCityCode("");
    setZip("");
    setLocalityId("");
  }

  function handleCityChange(newCode: string) {
    setCityCode(newCode);
    // CP derivado de la ciudad elegida (owner 2026-10-07): el catálogo DANE trae el
    // CP REAL de las principales ciudades (Bogotá 110111, Medellín 050001, Cali
    // 760001, …); para las que no lo tienen se prellena el prefijo departamental y
    // el cliente lo completa. El CP no alimenta la cotización Aveonline (solo se
    // guarda en el snapshot de la orden) — dato opcional siempre editable.
    const city = getCityByCode(newCode);
    if (city?.zip) {
      setZip(city.zip);
    } else {
      const dept = DEPARTMENTS.find((d) => d.code === city?.deptCode);
      setZip(dept?.zipPrefix ?? "");
    }
    // La zona es específica de la ciudad — cambiar de ciudad la invalida.
    setLocalityId("");
  }

  function handleCruceChange(value: string) {
    // Auto-formato: si tipea solo dígitos, sugiere "NN-NN" cuando alcanza 2-3 dígitos.
    // No fuerza guion, solo limpia caracteres no válidos.
    const cleaned = value.replace(/[^\dA-Za-z-]/g, "").toUpperCase();
    setCruceNumber(cleaned);
  }

  // Copia EXPLÍCITA contacto → facturación (botón, no sincronización opaca):
  // el cliente la dispara y la puede re-disparar si edita el contacto después.
  // El documento solo se copia si el contacto lo diligenció y el tipo es válido
  // para facturación (el select de billing no ofrece TI).
  function copyContactToBilling() {
    setBillingName(fullName);
    if (docType && docType !== "TI") setBillingDocType(docType);
    if (docNumber) setBillingDocNumber(docNumber);
  }

  // Validaciones derivadas
  const isPhoneValid = phoneDisplay.length === 0 || validatePhone(phoneDisplay);
  const isNameValid = fullName.length === 0 || validateName(fullName);
  const isEmailValid = email.length === 0 || isValidEmail(email);
  const isDocValid = !docType || docNumber.length === 0 || validateDocument(docType, docNumber);

  function err(field: string): string | null {
    return state?.fieldErrors?.[field]?.[0] ?? null;
  }

  // ─── Errores efectivos por campo (cliente visible ?? servidor) ───
  // Mismo criterio de prioridad que FieldHint: el error cliente (si ya es
  // visible por touched/submit) tapa al del server. Se usan para pintar el
  // borde del campo (aria-invalid), el resumen sobre el botón y el scroll.
  // (2026-10-20) `req(empty)`: capa «obligatorio VACÍO» que reemplaza la
  // validación nativa (form con noValidate — ver handleSubmitAttempt).
  //
  // TODA la derivación vive en computeErrors(sc, tch) — función de
  // (submitCount, touched): el render la llama con los valores reales y
  // handleSubmitAttempt con (submitCount+1, todo touched) para saber qué
  // errores QUEDARÍAN visibles tras el intento y frenar el submit con
  // preventDefault TAMBIÉN en el primero (leer el render vigente era stale:
  // el primer submit viajaba al server con campos vacíos).
  // Mapas para renderizar los campos del tipo de destino elegido (labels CMS,
  // setters de estado). Los placeholders salen de las constantes compartidas.
  const destValues: Record<DestinationField, string> = {
    apartment,
    tower,
    houseNumber,
    blockCode,
    complexName,
    floor,
    buildingName,
    officeNumber,
    companyName,
    referencePoint,
  };
  const destFieldLabels: Record<DestinationField, string> = {
    apartment: texts.apartmentLabel,
    tower: texts.towerLabel,
    houseNumber: texts.houseNumberLabel,
    blockCode: texts.blockLabel,
    complexName: texts.complexNameLabel,
    floor: texts.floorLabel,
    buildingName: texts.buildingNameLabel,
    officeNumber: texts.officeNumberLabel,
    companyName: texts.companyNameLabel,
    referencePoint: texts.refPointLabel,
  };
  const destSetters: Record<DestinationField, (v: string) => void> = {
    apartment: setApartment,
    tower: setTower,
    houseNumber: setHouseNumber,
    blockCode: setBlockCode,
    complexName: setComplexName,
    floor: setFloor,
    buildingName: setBuildingName,
    officeNumber: setOfficeNumber,
    companyName: setCompanyName,
    referencePoint: setReferencePoint,
  };
  const destFieldErrFor =
    (sc: number, tch: Record<string, boolean>) =>
    (field: DestinationField): string | null => {
      if (!destinationType) return null;
      const cfg = DESTINATION_CONFIG[destinationType];
      // El campo no aplica al tipo elegido (no se renderiza) → sin error.
      if (!cfg.required.includes(field) && !cfg.optional.includes(field)) return null;
      const clientErr =
        missingDestinationFields(destinationType, destValues).includes(field) &&
        (tch[field] || sc > 0)
          ? DESTINATION_REQUIRED_ERRORS[field]
          : null;
      return clientErr ?? err(field);
    };
  const destFieldErr = destFieldErrFor(submitCount, touched);

  const computeErrors = (
    sc: number,
    tch: Record<string, boolean>,
  ): Record<ErrorFieldKey, string | null> => {
    const req = (empty: boolean) => (sc > 0 && empty ? texts.requiredField : null);
    const fullNameErr =
      req(!fullName.trim()) ??
      (fullName.length > 0 && !isNameValid && tch.fullName ? texts.nameError : null) ??
      err("fullName");
    const emailErr =
      req(!email.trim()) ??
      (email.length > 0 && !isEmailValid && tch.email ? texts.emailError : null) ??
      err("email");
    const phoneErr =
      req(!phoneDisplay.replace(/\D/g, "")) ??
      (phoneDisplay.length > 0 && !isPhoneValid && tch.phone ? texts.phoneError : null) ??
      err("phone");
    const docErr =
      (docType && docNumber.length > 0 && !isDocValid && tch.documentNumber
        ? `Formato inválido. ${getDocumentHelp(docType as DocumentType)}`
        : null) ?? err("documentNumber");
    const deptErr = req(!deptCode) ?? err("deptCode");
    const cityErr = req(!cityCode) ?? err("cityCode");
    const zipErr = err("zip");
    const neighborhoodErr = err("neighborhood");
    const localityErr = req(showZoneSelect && !localityId) ?? err("localityId");
    // Dirección urbana: mensaje ESPECÍFICO de qué falta (fix QA STG 2026-10 —
    // "Calle 3 sur #" incompleta). Los validadores son los mismos del schema
    // del server, así el mensaje es idéntico en cliente y servidor.
    const viaClientErr = viaNumber.length > 0 && tch.viaNumber ? viaNumberError(viaNumber) : null;
    const cruceClientErr =
      cruceNumber.length > 0 && tch.cruceNumber ? cruceNumberError(cruceNumber) : null;
    const viaErr = req(!viaNumber.trim()) ?? viaClientErr ?? err("viaNumber");
    const cruceErr = req(!cruceNumber.trim()) ?? cruceClientErr ?? err("cruceNumber");
    // Tipo de destino (2026-10): obligatorio en el form; los campos requeridos
    // por tipo espejan el superRefine del schema (mismos mensajes, misma fuente).
    const destTypeErr =
      (!destinationType && (tch.destinationType || sc > 0) ? texts.destTypeError : null) ??
      err("destinationType");
    const veredaErr = req(!vereda.trim()) ?? err("vereda");
    const referenciaErr =
      req(!referencia.trim()) ??
      (referencia.length > 0 && referencia.length < RURAL_REF_MIN_LENGTH ? texts.refError : null) ??
      err("referencia");
    const altPhoneErr =
      (altPhoneDisplay.length > 0 && !validatePhone(altPhoneDisplay) && (tch.altPhone || sc > 0)
        ? texts.phoneError
        : null) ?? err("altPhone");
    const recipientNameErr =
      req(!recipientName.trim()) ??
      (recipientName.length > 0 && !validateName(recipientName) && tch.recipientName
        ? "Solo letras, espacios y acentos (sin números)"
        : null) ??
      err("recipientName");
    const recipientPhoneErr =
      req(!recipientPhoneDisplay.replace(/\D/g, "")) ??
      (recipientPhoneDisplay.length > 0 &&
      !validatePhone(recipientPhoneDisplay) &&
      tch.recipientPhone
        ? "Debe ser un móvil colombiano de 10 dígitos (300...)"
        : null) ??
      err("recipientPhone");
    const giftMessageErr = err("giftMessage");
    // El server reporta la facturación incompleta bajo la key "wantsInvoice":
    // se reparte a los campos de facturación que quedaron VACÍOS (los que el
    // cliente debe llenar), no a todos, para no pintar rojo lo que ya está bien.
    const billingMissing = wantsInvoice ? err("wantsInvoice") : null;
    const billingNumberErr =
      err("billingDocumentNumber") ?? (!billingDocNumber.trim() ? billingMissing : null);
    const billingNameErr = err("billingName") ?? (!billingName.trim() ? billingMissing : null);
    const consentErr = req(!dataConsent) ?? err("dataConsent");

    // Mapa key → error activo. Los campos ocultos por toggles (destinatario,
    // facturación, rural/urbano, zona fuera de catálogo) quedan en null para
    // que no salgan en el resumen ni reciban scroll.
    return {
      fullName: fullNameErr,
      email: emailErr,
      phone: phoneErr,
      documentNumber: docErr,
      deptCode: deptErr,
      cityCode: cityErr,
      zip: zipErr,
      neighborhood: neighborhoodErr,
      localityId: showZoneSelect ? localityErr : null,
      viaNumber: addressKind === "urban" ? viaErr : null,
      cruceNumber: addressKind === "urban" ? cruceErr : null,
      destinationType: addressKind === "urban" ? destTypeErr : null,
      apartment: addressKind === "urban" ? destFieldErrFor(sc, tch)("apartment") : null,
      tower: addressKind === "urban" ? destFieldErrFor(sc, tch)("tower") : null,
      houseNumber: addressKind === "urban" ? destFieldErrFor(sc, tch)("houseNumber") : null,
      officeNumber: addressKind === "urban" ? destFieldErrFor(sc, tch)("officeNumber") : null,
      vereda: addressKind === "rural" ? veredaErr : null,
      referencia: addressKind === "rural" ? referenciaErr : null,
      altPhone: addressKind === "rural" ? altPhoneErr : null,
      recipientName: hasRecipient ? recipientNameErr : null,
      recipientPhone: hasRecipient ? recipientPhoneErr : null,
      giftMessage: hasRecipient && isGift ? giftMessageErr : null,
      billingDocumentNumber: wantsInvoice ? billingNumberErr : null,
      billingName: wantsInvoice ? billingNameErr : null,
      dataConsent: consentErr,
    };
  };
  const errorByField = computeErrors(submitCount, touched);
  // Alias por campo para el JSX (aria-invalid, aria-describedby, FieldHint):
  // el gating por toggles de computeErrors es compatible (los campos ocultos
  // no se renderizan, así que su alias nunca se lee en ese estado).
  const {
    fullName: fullNameErr,
    email: emailErr,
    phone: phoneErr,
    documentNumber: docErr,
    deptCode: deptErr,
    cityCode: cityErr,
    zip: zipErr,
    neighborhood: neighborhoodErr,
    localityId: localityErr,
    viaNumber: viaErr,
    cruceNumber: cruceErr,
    destinationType: destTypeErr,
    vereda: veredaErr,
    referencia: referenciaErr,
    altPhone: altPhoneErr,
    recipientName: recipientNameErr,
    recipientPhone: recipientPhoneErr,
    giftMessage: giftMessageErr,
    billingDocumentNumber: billingNumberErr,
    billingName: billingNameErr,
    dataConsent: consentErr,
  } = errorByField;
  // Error agregado de facturación incompleta (key "wantsInvoice" del server) —
  // el checkbox lo usa para aria-invalid (la sección está tras el flag
  // BILLING_DOCUMENT_ENABLED, pero el alias debe existir siempre).
  const billingMissing = wantsInvoice ? err("wantsInvoice") : null;

  const errorLabels: Record<ErrorFieldKey, string> = {
    fullName: texts.nameLabel,
    email: texts.emailLabel,
    phone: texts.phoneLabel,
    documentNumber: "Documento",
    deptCode: "Departamento",
    cityCode: texts.cityLabel,
    zip: "Código postal",
    neighborhood: "Barrio",
    localityId: zoneCity?.zoneLabel ?? "Zona de entrega",
    viaNumber: texts.viaLabel,
    cruceNumber: texts.cruceLabel,
    destinationType: texts.destTypeLabel,
    apartment: texts.apartmentLabel,
    tower: texts.towerLabel,
    houseNumber: texts.houseNumberLabel,
    officeNumber: texts.officeNumberLabel,
    vereda: texts.veredaLabel,
    referencia: texts.refLabel,
    altPhone: texts.altPhoneLabel,
    recipientName: "Nombre de quien recibe",
    recipientPhone: "Teléfono de quien recibe",
    giftMessage: "Mensaje para la tarjeta",
    billingDocumentNumber: texts.billingNumberLabel,
    billingName: texts.billingNameLabel,
    dataConsent: "Autorización de tratamiento de datos",
  };

  // Lista ordenada (orden del DOM) de campos con error — alimenta el resumen
  // y el scroll al primero.
  const invalidFields = ERROR_FIELD_ORDER.filter((k) => errorByField[k]).map((k) => ({
    key: k,
    label: errorLabels[k],
  }));

  // Scroll + foco al primer campo inválido tras un submit fallido. El efecto
  // corre cuando (a) se intenta enviar (errores cliente visibles al marcar
  // todo touched) y (b) cuando llega la respuesta del server (state nuevo).
  const invalidRef = useRef(invalidFields);
  useEffect(() => {
    invalidRef.current = invalidFields;
  });

  function scrollToField(key: ErrorFieldKey) {
    const el = document.getElementById(ERROR_FIELD_IDS[key]);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (submitCount === 0) return;
    const first = invalidRef.current[0];
    if (first) scrollToField(first.key);
    // submitCount/state disparan el efecto una vez por intento de submit;
    // invalidRef siempre tiene la lista fresca sin re-dispararlo al tipear.
  }, [submitCount, state]);

  // (2026-10-20, feedback owner — «Continuar al envío no avisa qué falta»): el
  // form va con noValidate — la validación nativa del navegador bloqueaba el
  // submit ANTES de este handler, así que un campo obligatorio VACÍO solo
  // mostraba la burbuja nativa (casi invisible en móvil) y nuestro resumen de
  // «qué falta» nunca aparecía. Ahora TODA la validación es nuestra: la capa
  // «campo obligatorio vacío» (texts.requiredField) alimenta el resumen, el
  // borde rojo y el scroll+foco al primer campo — mismo patrón del «Ver diseño»
  // del estudio.
  function handleSubmitAttempt(e: React.FormEvent) {
    const nextTouched = {
      ...touched,
      fullName: true,
      email: true,
      phone: true,
      documentNumber: true,
      recipientName: true,
      recipientPhone: true,
      viaNumber: true,
      cruceNumber: true,
      destinationType: true,
      apartment: true,
      tower: true,
      houseNumber: true,
      officeNumber: true,
      altPhone: true,
    };
    setTouched(nextTouched);
    setSubmitCount((c) => c + 1);
    // Con noValidate el submit ya no lo frena el navegador: si hay errores
    // cliente QUE QUEDARÍAN visibles tras este intento (todo touched +
    // submitCount+1), el form no viaja al server — ni siquiera en el primer
    // intento (ahorro del round-trip — el server igual re-valida como defensa
    // cuando el form sí sale).
    const nextErrors = computeErrors(submitCount + 1, nextTouched);
    if (ERROR_FIELD_ORDER.some((k) => nextErrors[k])) e.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={handleSubmitAttempt} noValidate className="space-y-6">
      {/* CONTACTO */}
      <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-brand-purple-dark font-display mb-4 text-lg font-bold">
          {texts.contactTitle}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Nombre */}
          <div>
            <Label
              htmlFor="fullName"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              {texts.nameLabel} <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="fullName"
              name="fullName"
              required
              placeholder={texts.namePlaceholder}
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                clearTouched("fullName");
              }}
              onBlur={handleNameBlur}
              aria-invalid={Boolean(fullNameErr)}
              aria-describedby={fullNameErr ? "fullName-error" : undefined}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
            <FieldHint
              id="fullName-error"
              clientError={fullNameErr}
              serverError={err("fullName")}
            />
          </div>

          {/* Email con autocomplete */}
          <div className="relative">
            <Label
              htmlFor="email"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              {texts.emailLabel} <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder={texts.emailPlaceholder}
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              onBlur={handleEmailBlur}
              aria-invalid={Boolean(emailErr)}
              aria-describedby={emailErr ? "email-error" : undefined}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
              autoComplete="email"
            />
            {/* Dropdown sugerencias */}
            {emailSuggestions.length > 0 && (
              <ul className="border-brand-purple/20 absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-white shadow-lg">
                {emailSuggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      className="text-brand-purple-dark hover:bg-brand-purple/10 block w-full px-3 py-2 text-left text-sm"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setEmail(s);
                        setEmailSuggestions([]);
                      }}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <FieldHint
              id="email-error"
              clientError={emailErr}
              serverError={err("email")}
              hint={texts.emailHint}
            />
            {/* Sugerencia de typo */}
            {emailTypoFix && (
              <p className="mt-1 text-xs text-amber-700">
                {texts.emailTypo}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setEmail(emailTypoFix);
                    setEmailTypoFix(null);
                  }}
                  className="font-semibold underline"
                >
                  {emailTypoFix}
                </button>
                ?
              </p>
            )}
          </div>

          {/* Teléfono */}
          <div>
            <Label
              htmlFor="phone-display"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              {texts.phoneLabel} <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="phone-display"
              type="tel"
              required
              placeholder="300 887 3826"
              value={phoneDisplay}
              onChange={(e) => handlePhoneChange(e.target.value)}
              onBlur={() => markTouched("phone")}
              maxLength={12} // 10 dígitos + 2 espacios
              aria-invalid={Boolean(phoneErr)}
              aria-describedby={phoneErr ? "phone-error" : undefined}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
              autoComplete="tel-national"
              inputMode="numeric"
            />
            {/* Campo hidden con el valor sin formato (lo que se envía al server) */}
            <input type="hidden" name="phone" value={stripPhone(phoneDisplay)} />
            <FieldHint
              id="phone-error"
              clientError={phoneErr}
              serverError={err("phone")}
              hint={texts.phoneHint}
            />
          </div>

          {/* Documento (opcional) */}
          <div>
            <Label className="text-brand-purple-dark mb-1 block text-xs font-semibold">
              {texts.docLabel}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <select
                name="contactDocumentType"
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocumentType | "")}
                className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 col-span-1 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none"
              >
                <option value="">—</option>
                {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Input
                id="contactDocumentNumber"
                name="contactDocumentNumber"
                value={docNumber}
                onChange={(e) => {
                  setDocNumber(e.target.value);
                  clearTouched("documentNumber");
                }}
                onBlur={() => markTouched("documentNumber")}
                disabled={!docType}
                placeholder={docType ? "1234567890" : texts.docTypePlaceholder}
                aria-invalid={Boolean(docErr)}
                aria-describedby={docErr ? "documentNumber-error" : undefined}
                className="border-brand-purple/20 focus-visible:ring-brand-purple/30 col-span-2"
              />
            </div>
            <FieldHint
              id="documentNumber-error"
              clientError={
                docType && docNumber.length > 0 && !isDocValid && touched.documentNumber
                  ? `Formato inválido. ${getDocumentHelp(docType as DocumentType)}`
                  : null
              }
              serverError={err("documentNumber")}
              hint={docType ? getDocumentHelp(docType as DocumentType) : undefined}
            />
          </div>
        </div>
      </section>

      {/* DIRECCIÓN */}
      <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-brand-purple-dark font-display mb-4 text-lg font-bold">
          {texts.addressTitle}
        </h2>

        {/* USAR DIRECCIÓN GUARDADA — solo si el cliente logueado tiene direcciones */}
        {savedAddresses.length > 0 && (
          <div className="border-brand-purple/25 bg-brand-purple/5 mb-4 rounded-xl border p-3">
            <label
              htmlFor="saved-address"
              className="text-brand-purple-dark mb-1.5 block text-sm font-semibold"
            >
              {texts.savedLabel}
            </label>
            <select
              id="saved-address"
              defaultValue=""
              onChange={(e) => e.target.value && applySavedAddress(e.target.value)}
              className="border-brand-purple/25 focus:border-brand-purple h-9 w-full rounded-md border bg-white px-2 text-sm"
            >
              <option value="">{texts.savedNew}</option>
              {savedAddresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                  {a.isDefault ? " (predeterminada)" : ""} — {a.line1}
                </option>
              ))}
            </select>
            <p className="text-brand-muted mt-1.5 text-xs">{texts.savedNote}</p>
          </div>
        )}

        {/* Depto + Ciudad + CP */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <Label
              htmlFor="deptCode"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Departamento <span className="text-rose-600">*</span>
            </Label>
            <select
              id="deptCode"
              name="deptCode"
              required
              value={deptCode}
              onChange={(e) => handleDeptChange(e.target.value)}
              aria-invalid={Boolean(deptErr)}
              aria-describedby={deptErr ? "deptCode-error" : undefined}
              className={`h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none ${
                deptErr
                  ? ERROR_SELECT_CLASSES
                  : "border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20"
              }`}
            >
              <option value="">{texts.deptPlaceholder}</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
            <FieldHint id="deptCode-error" clientError={deptErr} serverError={err("deptCode")} />
            {/* Hidden snapshot human-readable */}
            <input type="hidden" name="department" value={selectedDept?.name ?? ""} />
          </div>

          <div className="sm:col-span-3">
            <Label
              htmlFor="cityCode"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              {texts.cityLabel} <span className="text-rose-600">*</span>
            </Label>
            <select
              id="cityCode"
              name="cityCode"
              required
              value={cityCode}
              onChange={(e) => handleCityChange(e.target.value)}
              disabled={!deptCode}
              aria-invalid={Boolean(cityErr)}
              aria-describedby={cityErr ? "cityCode-error" : undefined}
              className={`h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 ${
                cityErr
                  ? ERROR_SELECT_CLASSES
                  : "border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20"
              }`}
            >
              <option value="">{deptCode ? texts.cityPlaceholder : texts.cityWait}</option>
              {cities.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldHint
              id="cityCode-error"
              clientError={cityErr}
              serverError={err("cityCode")}
              hint={deptCode && cities.length === 0 ? texts.cityMissing : undefined}
            />
            <input type="hidden" name="city" value={selectedCity?.name ?? ""} />
          </div>

          <div className="sm:col-span-2">
            <Label
              htmlFor="zip"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              {texts.zipLabel}
            </Label>
            <Input
              id="zip"
              name="zip"
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={texts.zipPlaceholder}
              aria-invalid={Boolean(zipErr)}
              aria-describedby={zipErr ? "zip-error" : undefined}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
              inputMode="numeric"
            />
            {/* Campo opcional: NO se autorrellena (el CP municipal DANE se
                confundía con el número de pedido) y la cotización Aveonline no
                lo usa — ver handleCityChange. */}
            <FieldHint
              id="zip-error"
              clientError={null}
              serverError={err("zip")}
              hint={texts.zipHint}
            />
          </div>
        </div>

        {/* Barrio (opcional, todas las ciudades) — convive con la zona/localidad:
            no son lo mismo (la zona sale del catálogo, el barrio es texto libre). */}
        <div className="mt-4">
          <Label
            htmlFor="neighborhood"
            className="text-brand-purple-dark mb-1 block text-xs font-semibold"
          >
            {texts.neighborhoodLabel}
          </Label>
          <Input
            id="neighborhood"
            name="neighborhood"
            value={neighborhood}
            onChange={(e) => setNeighborhood(e.target.value)}
            placeholder={texts.neighborhoodPlaceholder}
            maxLength={100}
            aria-invalid={Boolean(neighborhoodErr)}
            aria-describedby={neighborhoodErr ? "neighborhood-error" : undefined}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 sm:max-w-xs"
          />
          <FieldHint
            id="neighborhood-error"
            clientError={null}
            serverError={err("neighborhood")}
            hint={texts.neighborhoodHint}
          />
        </div>

        {/* Zona de entrega (localidad/comuna del catálogo lib/lucams-zones.ts) —
            dato de dirección: obligatoria siempre que la ciudad esté en el
            catálogo (lo re-valida el server), haya o no envío propio activo. */}
        {showZoneSelect && zoneCity && (
          <div className="mt-4">
            <Label
              htmlFor="localityId"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              {zoneCity.zoneLabel} <span className="text-rose-600">*</span>
            </Label>
            <select
              id="localityId"
              name="localityId"
              value={localityId}
              onChange={(e) => setLocalityId(e.target.value)}
              required
              aria-invalid={Boolean(localityErr)}
              aria-describedby={localityErr ? "localityId-error" : undefined}
              className={`h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none sm:max-w-xs ${
                localityErr
                  ? ERROR_SELECT_CLASSES
                  : "border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20"
              }`}
            >
              <option value="">Elige tu {zoneCity.zoneLabel.toLowerCase()}…</option>
              {zoneOptions.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            <FieldHint
              id="localityId-error"
              clientError={localityErr}
              serverError={err("localityId")}
              hint={texts.zoneHint.replace("{zona}", zoneCity.zoneLabel.toLowerCase())}
            />
          </div>
        )}

        {/* Toggle Urbana / Rural (Lucy 2026-05-21) */}
        <div className="mt-4">
          <Label className="text-brand-purple-dark mb-2 block text-xs font-semibold">
            {texts.kindLabel} <span className="text-rose-600">*</span>
          </Label>
          <input type="hidden" name="addressKind" value={addressKind} />
          <div role="radiogroup" aria-label={texts.kindLabel} className="grid grid-cols-2 gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={addressKind === "urban"}
              onClick={() => setAddressKind("urban")}
              className={
                "rounded-lg border-2 p-3 text-left transition-all " +
                (addressKind === "urban"
                  ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-2"
                  : "border-brand-purple/15 hover:border-brand-purple/30")
              }
            >
              <div className="text-brand-purple-dark text-sm font-semibold">{texts.kindUrban}</div>
              <div className="text-brand-muted text-xs">{texts.kindUrbanDesc}</div>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={addressKind === "rural"}
              onClick={() => setAddressKind("rural")}
              className={
                "rounded-lg border-2 p-3 text-left transition-all " +
                (addressKind === "rural"
                  ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-2"
                  : "border-brand-purple/15 hover:border-brand-purple/30")
              }
            >
              <div className="text-brand-purple-dark text-sm font-semibold">{texts.kindRural}</div>
              <div className="text-brand-muted text-xs">{texts.kindRuralDesc}</div>
            </button>
          </div>
        </div>

        {addressKind === "urban" ? (
          <>
            {/* Dirección urbana — nomenclatura colombiana completa
                (Lucy 2026-05-21: bis + cardinal + letras) */}
            <div className="mt-4 space-y-3">
              <Label className="text-brand-purple-dark block text-xs font-semibold">
                {texts.addressLabel} <span className="text-rose-600">*</span>
              </Label>

              {/* Primera fila: Tipo de vía + Número + Bis + Cardinal */}
              <div>
                <p className="text-brand-muted mb-1 text-[10px] font-semibold tracking-wide uppercase">
                  {texts.viaLabel}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <select
                    name="viaType"
                    value={viaType}
                    onChange={(e) => setViaType(e.target.value as (typeof VIA_TYPES)[number])}
                    aria-label={texts.viaTypeAria}
                    className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none sm:col-span-4"
                  >
                    {VIA_TYPES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <Input
                    id="viaNumber"
                    name="viaNumber"
                    required
                    value={viaNumber}
                    onChange={(e) => {
                      setViaNumber(e.target.value.toUpperCase().replace(/[^\dA-Z]/g, ""));
                      clearTouched("viaNumber");
                    }}
                    onBlur={() => markTouched("viaNumber")}
                    placeholder="7A"
                    maxLength={10}
                    aria-invalid={Boolean(viaErr)}
                    aria-describedby={viaErr ? "viaNumber-error" : undefined}
                    className="border-brand-purple/20 focus-visible:ring-brand-purple/30 sm:col-span-3"
                    aria-label={texts.viaNumberAria}
                  />
                  <label className="border-brand-purple/20 inline-flex h-9 items-center justify-center gap-1.5 rounded-md border bg-white px-2 text-xs sm:col-span-2">
                    <input
                      type="checkbox"
                      name="viaBis"
                      checked={viaBis}
                      onChange={(e) => setViaBis(e.target.checked)}
                      className="accent-brand-purple h-3.5 w-3.5"
                    />
                    <span className="text-brand-purple-dark font-semibold">{texts.viaBis}</span>
                  </label>
                  <select
                    name="viaCardinal"
                    value={viaCardinal}
                    onChange={(e) => setViaCardinal(e.target.value)}
                    aria-label={texts.viaCardinalAria}
                    className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none sm:col-span-3"
                  >
                    <option value="">{texts.cardinalPlaceholder}</option>
                    <option value="Norte">Norte</option>
                    <option value="Sur">Sur</option>
                    <option value="Este">Este</option>
                    <option value="Oeste">Oeste</option>
                  </select>
                </div>
                <FieldHint
                  id="viaNumber-error"
                  clientError={viaErr}
                  serverError={err("viaNumber")}
                  hint={texts.viaHint.replace("{ejemplo}", viaExample(viaType))}
                />
              </div>

              {/* Segunda fila: Cruce + Cardinal del cruce */}
              <div>
                <p className="text-brand-muted mb-1 text-[10px] font-semibold tracking-wide uppercase">
                  {texts.cruceLabel}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <div className="border-brand-purple/20 col-span-1 hidden h-9 items-center justify-center rounded-md border bg-slate-50 text-sm font-bold text-slate-600 sm:flex">
                    #
                  </div>
                  <Input
                    id="cruceNumber"
                    name="cruceNumber"
                    required
                    value={cruceNumber}
                    onChange={(e) => {
                      handleCruceChange(e.target.value);
                      clearTouched("cruceNumber");
                    }}
                    onBlur={() => markTouched("cruceNumber")}
                    placeholder="23-45"
                    maxLength={20}
                    aria-invalid={Boolean(cruceErr)}
                    aria-describedby={cruceErr ? "cruceNumber-error" : undefined}
                    className="border-brand-purple/20 focus-visible:ring-brand-purple/30 sm:col-span-8"
                    aria-label="Cruce"
                  />
                  <select
                    name="cruceCardinal"
                    value={cruceCardinal}
                    onChange={(e) => setCruceCardinal(e.target.value)}
                    aria-label={texts.cruceCardinalAria}
                    className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none sm:col-span-3"
                  >
                    <option value="">{texts.cardinalPlaceholder}</option>
                    <option value="Norte">Norte</option>
                    <option value="Sur">Sur</option>
                    <option value="Este">Este</option>
                    <option value="Oeste">Oeste</option>
                  </select>
                </div>
                <FieldHint
                  id="cruceNumber-error"
                  clientError={cruceErr}
                  serverError={err("cruceNumber")}
                  hint={texts.cruceHint}
                />
              </div>
            </div>

            {/* Tipo de destino + campos estructurados por tipo (2026-10,
                anti-devoluciones). Reemplaza al «Complemento» libre: el detail
                legacy se migra visualmente a referencePoint al cargar. */}
            <div className="mt-4">
              <Label className="text-brand-purple-dark mb-2 block text-xs font-semibold">
                {texts.destTypeLabel} <span className="text-rose-600">*</span>
              </Label>
              <input type="hidden" name="destinationType" value={destinationType} />
              <div
                role="radiogroup"
                aria-label={texts.destTypeLabel}
                id="destinationType"
                tabIndex={-1}
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {DESTINATION_GROUPS.map((g) => {
                  const checked =
                    g.id === "conjunto"
                      ? destinationType === "conjunto_torres" ||
                        destinationType === "conjunto_casas"
                      : destinationType === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => {
                        markTouched("destinationType");
                        if (g.id === "conjunto") {
                          setDestinationType(
                            conjuntoSubtype === "torres" ? "conjunto_torres" : "conjunto_casas",
                          );
                        } else {
                          setDestinationType(g.id);
                        }
                      }}
                      className={
                        "rounded-lg border-2 p-2.5 text-center text-sm font-semibold transition-all " +
                        (checked
                          ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 text-brand-purple-dark ring-2"
                          : "border-brand-purple/15 text-brand-purple-dark hover:border-brand-purple/30")
                      }
                    >
                      {g.id === "casa"
                        ? texts.destCasa
                        : g.id === "edificio"
                          ? texts.destEdificio
                          : g.id === "conjunto"
                            ? texts.destConjunto
                            : texts.destOficina}
                    </button>
                  );
                })}
              </div>
              {/* Sub-toggle del conjunto residencial: Torres | Casas */}
              {(destinationType === "conjunto_torres" || destinationType === "conjunto_casas") && (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-xs">
                  {(["torres", "casas"] as const).map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      role="radio"
                      aria-checked={
                        destinationType ===
                        (sub === "torres" ? "conjunto_torres" : "conjunto_casas")
                      }
                      onClick={() => {
                        setConjuntoSubtype(sub);
                        setDestinationType(sub === "torres" ? "conjunto_torres" : "conjunto_casas");
                      }}
                      className={
                        "rounded-md border px-2 py-1.5 text-xs font-semibold transition-all " +
                        (destinationType ===
                        (sub === "torres" ? "conjunto_torres" : "conjunto_casas")
                          ? "border-brand-purple bg-brand-purple/10 text-brand-purple-dark"
                          : "border-brand-purple/15 text-brand-muted hover:border-brand-purple/30")
                      }
                    >
                      {sub === "torres" ? texts.destConjuntoTorres : texts.destConjuntoCasas}
                    </button>
                  ))}
                </div>
              )}
              <FieldHint
                id="destinationType-error"
                clientError={destTypeErr}
                serverError={err("destinationType")}
              />

              {/* Campos del tipo elegido: requeridos primero (con asterisco),
                  opcionales después — misma fuente DESTINATION_CONFIG que el
                  superRefine del server. */}
              {destinationType && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    ...DESTINATION_CONFIG[destinationType].required,
                    ...DESTINATION_CONFIG[destinationType].optional,
                  ].map((field) => {
                    const isRequired = DESTINATION_CONFIG[destinationType].required.includes(field);
                    const fieldErr = destFieldErr(field);
                    return (
                      <div key={field}>
                        <Label
                          htmlFor={field}
                          className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                        >
                          {destFieldLabels[field]}
                          {isRequired && <span className="text-rose-600"> *</span>}
                        </Label>
                        <Input
                          id={field}
                          name={field}
                          value={destValues[field]}
                          onChange={(e) => {
                            destSetters[field](e.target.value);
                            clearTouched(field);
                          }}
                          onBlur={() => markTouched(field)}
                          placeholder={DESTINATION_FIELD_PLACEHOLDERS[field]}
                          maxLength={DESTINATION_FIELD_MAX[field]}
                          aria-invalid={Boolean(fieldErr)}
                          aria-describedby={fieldErr ? `${field}-error` : undefined}
                          className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                        />
                        <FieldHint
                          id={`${field}-error`}
                          clientError={fieldErr}
                          serverError={err(field)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Dirección rural */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label
                  htmlFor="vereda"
                  className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                >
                  {texts.veredaLabel} <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="vereda"
                  name="vereda"
                  required
                  value={vereda}
                  onChange={(e) => setVereda(e.target.value)}
                  placeholder={texts.veredaPlaceholder}
                  maxLength={120}
                  aria-invalid={Boolean(veredaErr)}
                  aria-describedby={veredaErr ? "vereda-error" : undefined}
                  className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                />
                <FieldHint id="vereda-error" clientError={veredaErr} serverError={err("vereda")} />
              </div>
              <div>
                <Label
                  htmlFor="finca"
                  className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                >
                  {texts.fincaLabel}
                </Label>
                <Input
                  id="finca"
                  name="finca"
                  value={finca}
                  onChange={(e) => setFinca(e.target.value)}
                  placeholder={texts.fincaPlaceholder}
                  maxLength={120}
                  className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                />
              </div>
            </div>
            <div className="mt-4">
              <Label
                htmlFor="referencia"
                className="text-brand-purple-dark mb-1 block text-xs font-semibold"
              >
                {texts.refLabel} <span className="text-rose-600">*</span>
              </Label>
              <textarea
                id="referencia"
                name="referencia"
                required
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder={texts.refPlaceholder}
                aria-invalid={Boolean(referenciaErr)}
                aria-describedby={referenciaErr ? "referencia-error" : undefined}
                className={`w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none ${
                  referenciaErr
                    ? ERROR_SELECT_CLASSES
                    : "border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20"
                }`}
              />
              <FieldHint
                id="referencia-error"
                clientError={referenciaErr}
                serverError={err("referencia")}
                hint={texts.refHint}
              />
            </div>
            {/* Teléfono alternativo en la zona (2026-10): la causa #1 de
                devolución rural es que el mensajero no localiza a nadie; este
                número se compone al final de la línea rural como «Tel. zona: X». */}
            <div className="mt-4">
              <Label
                htmlFor="altPhone-display"
                className="text-brand-purple-dark mb-1 block text-xs font-semibold"
              >
                {texts.altPhoneLabel}
              </Label>
              <Input
                id="altPhone-display"
                type="tel"
                value={altPhoneDisplay}
                onChange={(e) => {
                  setAltPhoneDisplay(formatPhone(e.target.value));
                  clearTouched("altPhone");
                }}
                onBlur={() => markTouched("altPhone")}
                placeholder="300 887 3826"
                maxLength={12}
                aria-invalid={Boolean(altPhoneErr)}
                aria-describedby={altPhoneErr ? "altPhone-error" : undefined}
                className="border-brand-purple/20 focus-visible:ring-brand-purple/30 sm:max-w-xs"
                inputMode="numeric"
              />
              {/* Valor sin formato (lo que se envía al server) */}
              <input type="hidden" name="altPhone" value={stripPhone(altPhoneDisplay)} />
              <FieldHint
                id="altPhone-error"
                clientError={
                  altPhoneDisplay.length > 0 &&
                  !validatePhone(altPhoneDisplay) &&
                  (touched.altPhone || submitCount > 0)
                    ? texts.phoneError
                    : null
                }
                serverError={err("altPhone")}
                hint={texts.altPhoneHint}
              />
            </div>
          </>
        )}

        {/* Preview live de cómo se verá la dirección */}
        {addressPreview && (
          <div className="border-brand-purple/15 bg-brand-purple/5 mt-4 rounded-lg border p-3">
            <p className="text-brand-muted text-[10px] font-semibold tracking-wider uppercase">
              {texts.previewLabel}
            </p>
            <p className="text-brand-purple-dark mt-1 text-sm">{addressPreview}</p>
            {selectedCity && selectedDept && (
              <p className="text-brand-muted text-xs">
                {selectedCity.name}, {selectedDept.name}
                {zip && ` · CP ${zip}`}
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <Label
            htmlFor="notes"
            className="text-brand-purple-dark mb-1 block text-xs font-semibold"
          >
            {texts.notesLabel}
          </Label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder={texts.notesPlaceholder}
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>

        {/* Guardar la dirección para la próxima (solo clientes logueados).
            Si la dirección aplicada ES una guardada sin cambios, el checkbox va
            deshabilitado con hint (guardar algo ya guardado no tendría efecto);
            editar cualquier campo lo rehabilita — hay una variante que guardar. */}
        {canSaveAddress && (
          <div className="border-brand-purple/10 mt-4 border-t pt-4">
            <label
              className={`text-brand-purple-dark flex items-center gap-2 text-sm font-medium ${
                savedAddressMatch ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                name="saveToAccount"
                checked={saveToAccount && !savedAddressMatch}
                disabled={savedAddressMatch}
                onChange={(e) => setSaveToAccount(e.target.checked)}
                className="accent-brand-purple h-4 w-4 rounded"
              />
              {texts.saveCheck}
            </label>
            {savedAddressMatch && (
              <p className="text-brand-muted mt-1 text-xs">{texts.saveCheckSavedHint}</p>
            )}
          </div>
        )}
      </section>

      {/* DESTINATARIO / REGALO (FLUJO REGALO) — sección propia entre dirección
          y facturación. Con el toggle on, nombre + teléfono de quien recibe
          son requeridos (van a la guía de la transportadora: es quien atiende
          al mensajero, y en COD quien paga el efectivo). "Es un regalo" oculta
          los precios del correo de confirmación y habilita el mensaje para la
          tarjeta. La facturación (sección siguiente) queda SIEMPRE a nombre
          del comprador. */}
      <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-brand-purple-dark font-display mb-2 text-lg font-bold">
          ¿Quién recibe el pedido?
        </h2>
        <label className="text-brand-purple-dark inline-flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="hasRecipient"
            checked={hasRecipient}
            onChange={(e) => setHasRecipient(e.target.checked)}
            className="accent-brand-purple h-4 w-4"
          />
          Lo recibe otra persona (va a su nombre y teléfono)
        </label>

        {hasRecipient && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label
                  htmlFor="recipientName"
                  className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                >
                  Nombre de quien recibe <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="recipientName"
                  name="recipientName"
                  required
                  value={recipientName}
                  onChange={(e) => {
                    setRecipientName(e.target.value);
                    clearTouched("recipientName");
                  }}
                  onBlur={() => {
                    if (recipientName.trim()) setRecipientName(capitalizeName(recipientName));
                    markTouched("recipientName");
                  }}
                  placeholder="Ej. Camila Torres"
                  maxLength={120}
                  aria-invalid={Boolean(recipientNameErr)}
                  aria-describedby={recipientNameErr ? "recipientName-error" : undefined}
                  className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                />
                <FieldHint
                  id="recipientName-error"
                  clientError={recipientNameErr}
                  serverError={err("recipientName")}
                />
              </div>
              <div>
                <Label
                  htmlFor="recipientPhone-display"
                  className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                >
                  Teléfono de quien recibe <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="recipientPhone-display"
                  type="tel"
                  required
                  value={recipientPhoneDisplay}
                  onChange={(e) => {
                    setRecipientPhoneDisplay(formatPhone(e.target.value));
                    clearTouched("recipientPhone");
                  }}
                  onBlur={() => markTouched("recipientPhone")}
                  placeholder="300 887 3826"
                  maxLength={12}
                  aria-invalid={Boolean(recipientPhoneErr)}
                  aria-describedby={recipientPhoneErr ? "recipientPhone-error" : undefined}
                  className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                  autoComplete="off"
                  inputMode="numeric"
                />
                {/* Valor sin formato (lo que se envía al server) */}
                <input
                  type="hidden"
                  name="recipientPhone"
                  value={stripPhone(recipientPhoneDisplay)}
                />
                <FieldHint
                  id="recipientPhone-error"
                  clientError={recipientPhoneErr}
                  serverError={err("recipientPhone")}
                  hint="La transportadora lo llama a este número al entregar."
                />
              </div>
            </div>

            <div>
              <label className="text-brand-purple-dark inline-flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  name="isGift"
                  checked={isGift}
                  onChange={(e) => setIsGift(e.target.checked)}
                  className="accent-brand-purple h-4 w-4"
                />
                Es un regalo 🎁 (tu correo de confirmación no mostrará precios)
              </label>
              {isGift && (
                <div className="mt-3">
                  <Label
                    htmlFor="giftMessage"
                    className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                  >
                    Mensaje para la tarjeta (opcional)
                  </Label>
                  <textarea
                    id="giftMessage"
                    name="giftMessage"
                    rows={2}
                    value={giftMessage}
                    onChange={(e) => setGiftMessage(e.target.value)}
                    maxLength={300}
                    placeholder="Ej. ¡Feliz cumpleaños! Con cariño, Lau"
                    aria-invalid={Boolean(giftMessageErr)}
                    aria-describedby={giftMessageErr ? "giftMessage-error" : undefined}
                    className={`w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none ${
                      giftMessageErr
                        ? ERROR_SELECT_CLASSES
                        : "border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20"
                    }`}
                  />
                  <FieldHint
                    id="giftMessage-error"
                    clientError={null}
                    serverError={err("giftMessage")}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* FACTURACIÓN — 2026-10-20: oculta detrás de BILLING_DOCUMENT_ENABLED
          (decisión del owner: persona natural sin trámites DIAN; el checkbox
          prometía un documento que no se opera — Ley 1480). Con el flag off el
          form no envía wantsInvoice y el server lo fuerza a false; el pipeline
          de datos queda intacto para reactivar. */}
      {BILLING_DOCUMENT_ENABLED && (
        <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-brand-purple-dark font-display mb-2 text-lg font-bold">
            {texts.billingTitle}
          </h2>
          <p className="text-brand-muted mb-4 text-sm">{texts.billingNote}</p>

          <label className="text-brand-purple-dark inline-flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              id="wantsInvoice"
              name="wantsInvoice"
              checked={wantsInvoice}
              onChange={(e) => setWantsInvoice(e.target.checked)}
              aria-invalid={Boolean(billingMissing)}
              className="accent-brand-purple h-4 w-4"
            />
            {texts.billingCheck}
          </label>

          {wantsInvoice && (
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyContactToBilling}
                className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 hover:text-brand-purple-dark mb-4"
              >
                Usar los datos del comprador
              </Button>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Label
                    htmlFor="billingDocumentType"
                    className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                  >
                    {texts.billingTypeLabel} <span className="text-rose-600">*</span>
                  </Label>
                  <select
                    id="billingDocumentType"
                    name="billingDocumentType"
                    value={billingDocType}
                    onChange={(e) =>
                      setBillingDocType(e.target.value as "CC" | "CE" | "NIT" | "PP")
                    }
                    className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none"
                  >
                    <option value="NIT">NIT</option>
                    <option value="CC">CC</option>
                    <option value="CE">CE</option>
                    <option value="PP">Pasaporte</option>
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <Label
                    htmlFor="billingDocumentNumber"
                    className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                  >
                    {texts.billingNumberLabel} <span className="text-rose-600">*</span>
                  </Label>
                  <Input
                    id="billingDocumentNumber"
                    name="billingDocumentNumber"
                    required={wantsInvoice}
                    value={billingDocNumber}
                    onChange={(e) => setBillingDocNumber(e.target.value)}
                    placeholder={texts.billingNumberPlaceholder}
                    aria-invalid={Boolean(billingNumberErr)}
                    aria-describedby={billingNumberErr ? "wantsInvoice-error" : undefined}
                    className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                  />
                  <FieldHint clientError={null} serverError={err("billingDocumentNumber")} />
                </div>
                <div className="sm:col-span-6">
                  <Label
                    htmlFor="billingName"
                    className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                  >
                    {texts.billingNameLabel} <span className="text-rose-600">*</span>
                  </Label>
                  <Input
                    id="billingName"
                    name="billingName"
                    required={wantsInvoice}
                    value={billingName}
                    onChange={(e) => setBillingName(e.target.value)}
                    placeholder={texts.billingNamePlaceholder}
                    aria-invalid={Boolean(billingNameErr)}
                    aria-describedby={billingNameErr ? "wantsInvoice-error" : undefined}
                    className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                  />
                  <FieldHint clientError={null} serverError={err("billingName")} />
                </div>
              </div>
            </div>
          )}
          {err("wantsInvoice") && (
            <p id="wantsInvoice-error" className="mt-2 text-xs text-rose-600">
              {err("wantsInvoice")}
            </p>
          )}
        </section>
      )}

      {/* AUTORIZACIÓN DE TRATAMIENTO DE DATOS (Ley 1581) — previa y expresa, también para invitados.
          Sin la casilla marcada, la acción no guarda la PII ni continúa. */}
      <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            id="dataConsent"
            name="dataConsent"
            required
            checked={dataConsent}
            onChange={(e) => setDataConsent(e.target.checked)}
            aria-invalid={Boolean(consentErr)}
            aria-describedby={consentErr ? "dataConsent-error" : undefined}
            className="accent-brand-purple mt-0.5 h-4 w-4 flex-shrink-0"
          />
          <span className="text-brand-purple-dark/90 [&_a]:text-brand-purple leading-relaxed [&_a]:underline">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {texts.consent}
            </ReactMarkdown>
          </span>
        </label>
        {consentErr && (
          <p id="dataConsent-error" className="mt-2 text-xs text-rose-600">
            {consentErr}
          </p>
        )}
      </section>

      {state?.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          ⚠️ {state.error}
        </div>
      )}

      {/* RESUMEN DE ERRORES (fix QA STG 2026-10): en un form largo el FieldHint
          queda fuera de pantalla y el submit fallido se percibe como "no pasa
          nada". Este bloque, visible junto al botón que el cliente acaba de
          oprimir, lista los campos a revisar; cada item salta al campo. Solo
          aparece tras un intento de submit (no mientras se diligencia).
          role="alert" → el lector de pantalla lo anuncia al aparecer. */}
      {submitCount > 0 && invalidFields.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          <p className="font-semibold">{texts.errorSummary}</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {invalidFields.map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={() => scrollToField(f.key)}
                  className="underline decoration-rose-300 underline-offset-2 hover:text-rose-900"
                >
                  {f.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          disabled={pending}
          size="lg"
          className="bg-gradient-brand w-full text-white hover:brightness-110 sm:w-auto"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {texts.pending}
            </>
          ) : (
            texts.submit
          )}
        </Button>
      </div>
    </form>
  );
}

function FieldHint({
  clientError,
  serverError,
  hint,
  id,
}: {
  clientError: string | null;
  serverError: string | null;
  hint?: string;
  /** id para que el input lo referencie con aria-describedby (fix QA 2026-10). */
  id?: string;
}) {
  if (clientError)
    return (
      <p id={id} className="mt-1 text-xs text-rose-600">
        {clientError}
      </p>
    );
  if (serverError)
    return (
      <p id={id} className="mt-1 text-xs text-rose-600">
        {serverError}
      </p>
    );
  if (hint)
    return (
      <p id={id} className="text-brand-muted mt-1 text-xs">
        {hint}
      </p>
    );
  return null;
}
