// @vitest-environment jsdom
/*
 * Test de componente — DatosForm.
 *
 * 2026-10-20 — la sección de facturación («Quiero documento tributario») se
 * ocultó detrás de BILLING_DOCUMENT_ENABLED (decisión del owner: persona
 * natural sin trámites DIAN). Acá se prueba el flag OFF (módulo real): la
 * sección NO se renderiza. La cobertura con flag ON (copia "Usar los datos
 * del comprador", names de los campos) vive en ./datos-form.billing.test.tsx,
 * que mockea el flag.
 *
 * `./actions` se mockea: es un módulo "use server" (db, cookies) que no
 * aplica a un render unitario — mismo patrón que quote-form.test.tsx.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("./actions", () => ({
  saveDatosAction: vi.fn(async () => null),
}));

import { DatosForm } from "./datos-form";
import { saveDatosAction } from "./actions";
import { DEFAULT_CHECKOUT_TEXTS } from "../checkout-texts";

afterEach(cleanup);

function renderForm() {
  return render(
    <DatosForm initial={{ step: 1, updatedAt: 0 }} texts={DEFAULT_CHECKOUT_TEXTS.datos} />,
  );
}

// Form mínimo VÁLIDO (todos los campos requeridos llenos): los tests del
// feedback del SERVER necesitan que la capa cliente «campo obligatorio vacío»
// (2026-10-20, noValidate + preventDefault) NO se active — así el resumen solo
// refleja los fieldErrors simulados del server y el submit sí viaja.
// Medellín (05001) no está en el catálogo de zonas → no exige localidad.
function fillValidRequired() {
  fireEvent.change(document.querySelector("#fullName")!, { target: { value: "Valentina Rojas" } });
  fireEvent.change(document.querySelector("#email")!, {
    target: { value: "valentina@correo.com" },
  });
  fireEvent.change(document.querySelector("#phone-display")!, {
    target: { value: "3008873826" },
  });
  fireEvent.change(document.querySelector("#deptCode")!, { target: { value: "05" } });
  fireEvent.change(document.querySelector("#cityCode")!, { target: { value: "05001" } });
  fireEvent.change(document.querySelector("#viaNumber")!, { target: { value: "10" } });
  fireEvent.change(document.querySelector("#cruceNumber")!, { target: { value: "15-20" } });
  // Tipo de destino (obligatorio desde 2026-10): Casa — sin campos extra.
  fireEvent.click(screen.getByRole("radio", { name: /Casa/ }));
  fireEvent.click(document.querySelector("#dataConsent")!);
}

describe("DatosForm — facturación apagada (BILLING_DOCUMENT_ENABLED = false, 2026-10-20)", () => {
  it("NO renderiza el checkbox «documento tributario» ni los campos de facturación", () => {
    renderForm();
    expect(document.querySelector('input[name="wantsInvoice"]')).not.toBeInTheDocument();
    expect(document.querySelector('select[name="billingDocumentType"]')).not.toBeInTheDocument();
    expect(document.querySelector('input[name="billingDocumentNumber"]')).not.toBeInTheDocument();
    expect(document.querySelector('input[name="billingName"]')).not.toBeInTheDocument();
    expect(screen.queryByText(DEFAULT_CHECKOUT_TEXTS.datos.billingTitle)).not.toBeInTheDocument();
  });

  it("el flujo sigue igual: el submit no exige nada de facturación", async () => {
    const { container } = renderForm();
    expect(container.querySelector("form")).toBeInTheDocument();
    // Form completo válido: sin errores cliente el submit sí viaja al server.
    fillValidRequired();
    // Sin wantsInvoice en el DOM, el FormData lo lleva ausente → el server lo
    // fuerza a false (gate en saveDatosAction) y el pipeline sigue intacto.
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(vi.mocked(saveDatosAction)).toHaveBeenCalled());
  });
});

/*
 * Fix QA STG 2026-10 — "al continuar con campos inválidos no pasa nada":
 * tras un submit fallido el form debe (a) mostrar un resumen anunciable de
 * los campos a revisar sobre el botón, (b) marcar los inputs inválidos con
 * aria-invalid + borde rojo y (c) hacer scroll + foco al PRIMER campo con
 * error (el FieldHint solo queda fuera de pantalla en un form largo).
 */
describe("DatosForm — feedback de errores tras submit fallido", () => {
  const scrollSpy = vi.fn();

  beforeEach(() => {
    // jsdom no implementa scrollIntoView.
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
  });

  afterEach(() => {
    scrollSpy.mockClear();
    // {} ≡ state sin errores (el mock original devuelve null; {} es el
    // equivalente tipado de DatosActionState sin error ni fieldErrors).
    vi.mocked(saveDatosAction).mockResolvedValue({});
  });

  function submitForm() {
    const form = document.querySelector("form");
    if (!form) throw new Error("DatosForm no renderizó <form>");
    // Estos tests ejercitan el feedback de errores del SERVER: el form va
    // completo y válido para que la capa «campo obligatorio vacío» no se
    // active (si no, el resumen y el scroll reflejarían los vacíos del fixture
    // y el preventDefault frenaría el submit antes de llegar al server).
    fillValidRequired();
    fireEvent.submit(form);
  }

  it("muestra el resumen anunciable (role=alert) con los campos con error del server", async () => {
    vi.mocked(saveDatosAction).mockResolvedValue({
      error: "Revisa los datos de contacto",
      fieldErrors: {
        phone: ["Debe ser un móvil colombiano de 10 dígitos (300...)"],
        cruceNumber: ["Formato: número-número (ej. 15-20, 13B-42)"],
      },
    });
    renderForm();

    submitForm();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Revisa estos campos antes de continuar:");
    expect(alert).toHaveTextContent("Teléfono móvil");
    expect(alert).toHaveTextContent("Cruce");
    // Campos sin error NO salen en el resumen.
    expect(alert).not.toHaveTextContent("Nombre completo");
  });

  it("marca los campos inválidos con aria-invalid + aria-describedby al FieldHint", async () => {
    vi.mocked(saveDatosAction).mockResolvedValue({
      error: "Revisa los datos de contacto",
      fieldErrors: {
        phone: ["Debe ser un móvil colombiano de 10 dígitos (300...)"],
        cruceNumber: ["Formato: número-número (ej. 15-20, 13B-42)"],
      },
    });
    renderForm();

    submitForm();

    await screen.findByRole("alert");
    const phone = document.querySelector<HTMLInputElement>("#phone-display")!;
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAttribute("aria-describedby", "phone-error");
    expect(document.querySelector("#phone-error")).toHaveTextContent(
      "Debe ser un móvil colombiano de 10 dígitos (300...)",
    );
    const cruce = document.querySelector<HTMLInputElement>("#cruceNumber")!;
    expect(cruce).toHaveAttribute("aria-invalid", "true");
    expect(cruce).toHaveAttribute("aria-describedby", "cruceNumber-error");
    // Campo sin error no queda marcado.
    expect(document.querySelector("#fullName")).toHaveAttribute("aria-invalid", "false");
  });

  it("hace scrollIntoView + foco al PRIMER campo con error (orden del form)", async () => {
    vi.mocked(saveDatosAction).mockResolvedValue({
      error: "Revisa los datos de contacto",
      fieldErrors: {
        phone: ["Debe ser un móvil colombiano de 10 dígitos (300...)"],
        cruceNumber: ["Formato: número-número (ej. 15-20, 13B-42)"],
      },
    });
    renderForm();

    submitForm();

    // phone va antes que cruceNumber en el form → es el destino del scroll.
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    const phone = document.querySelector<HTMLInputElement>("#phone-display")!;
    expect(scrollSpy.mock.contexts[0]).toBe(phone);
    expect(document.activeElement).toBe(phone);
  });

  it("también funciona con errores de validación cliente (formato inválido, sin server)", async () => {
    renderForm();
    // Form completo salvo el teléfono con formato inválido: no es «vacío» pero
    // no pasa validatePhone → error cliente visible tras el submit (punish
    // late) y el submit se frena en cliente (preventDefault, sin server).
    fillValidRequired();
    fireEvent.change(document.querySelector("#phone-display")!, { target: { value: "123" } });
    vi.mocked(saveDatosAction).mockClear();

    fireEvent.submit(document.querySelector("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Teléfono móvil");
    expect(document.querySelector("#phone-display")).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(vi.mocked(saveDatosAction)).not.toHaveBeenCalled();
  });

  it("los items del resumen saltan al campo correspondiente", async () => {
    vi.mocked(saveDatosAction).mockResolvedValue({
      error: "Revisa los datos de contacto",
      fieldErrors: {
        phone: ["Debe ser un móvil colombiano de 10 dígitos (300...)"],
        cruceNumber: ["Formato: número-número (ej. 15-20, 13B-42)"],
      },
    });
    renderForm();

    submitForm();
    const alert = await screen.findByRole("alert");
    scrollSpy.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Cruce" }));

    expect(alert).toBeInTheDocument();
    expect(scrollSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(document.querySelector("#cruceNumber"));
  });
});

/*
 * CP derivado de la ciudad (owner 2026-10-07): el catálogo DANE trae el CP REAL
 * de las principales ciudades (Bogotá 110111, Medellín 050001) y se prellena al
 * elegir ciudad — editable siempre. Ciudades sin CP municipal → prefijo
 * departamental parcial. Placeholder neutro y hint que aclara que no se pide
 * para cotizar.
 */
describe("DatosForm — código postal derivado de la ciudad (owner 2026-10-07)", () => {
  it("elegir Bogotá prellena el CP real (110111), editable", () => {
    renderForm();
    fireEvent.change(document.querySelector("#deptCode")!, { target: { value: "11" } });
    fireEvent.change(document.querySelector("#cityCode")!, { target: { value: "11001" } });
    expect(document.querySelector<HTMLInputElement>("#zip")!.value).toBe("110111");
    fireEvent.change(document.querySelector("#zip")!, { target: { value: "110411" } });
    expect(document.querySelector<HTMLInputElement>("#zip")!.value).toBe("110411");
  });

  it("elegir Medellín prellena su CP real (050001), no el de Bogotá", () => {
    renderForm();
    fireEvent.change(document.querySelector("#deptCode")!, { target: { value: "05" } });
    fireEvent.change(document.querySelector("#cityCode")!, { target: { value: "05001" } });
    expect(document.querySelector<HTMLInputElement>("#zip")!.value).toBe("050001");
  });

  it("ciudad sin CP municipal → prellena solo el prefijo departamental", () => {
    renderForm();
    fireEvent.change(document.querySelector("#deptCode")!, { target: { value: "05" } });
    // Abejorral (05002) no tiene zip municipal en el catálogo.
    fireEvent.change(document.querySelector("#cityCode")!, { target: { value: "05002" } });
    expect(document.querySelector<HTMLInputElement>("#zip")!.value).toBe("05");
  });

  it("cambiar de departamento limpia el CP", () => {
    renderForm();
    fireEvent.change(document.querySelector("#deptCode")!, { target: { value: "11" } });
    fireEvent.change(document.querySelector("#cityCode")!, { target: { value: "11001" } });
    fireEvent.change(document.querySelector("#deptCode")!, { target: { value: "05" } });
    expect(document.querySelector<HTMLInputElement>("#zip")!.value).toBe("");
  });

  it("el placeholder del CP es neutro (no '110111')", () => {
    renderForm();
    expect(document.querySelector<HTMLInputElement>("#zip")!.placeholder).toBe("Opcional");
  });
});

/*
 * Fix QA STG 2026-10 (item 3.2) — validación de dirección con mensaje
 * ESPECÍFICO de qué falta: el cruce incompleto ("15-") y la vía sin número
 * se rechazan en cliente al salir del campo (mismo validador del server).
 */
describe("DatosForm — validación de vía/cruce con mensaje específico", () => {
  it('cruce incompleto "15-" → "Falta el número después del guion…" al salir del campo', () => {
    renderForm();
    const cruce = document.querySelector<HTMLInputElement>("#cruceNumber")!;
    fireEvent.change(cruce, { target: { value: "15-" } });
    fireEvent.blur(cruce);
    expect(cruce).toHaveAttribute("aria-invalid", "true");
    expect(document.querySelector("#cruceNumber-error")).toHaveTextContent(
      "Falta el número después del guion",
    );
  });

  it('cruce completo "45-10" no muestra error', () => {
    renderForm();
    const cruce = document.querySelector<HTMLInputElement>("#cruceNumber")!;
    fireEvent.change(cruce, { target: { value: "45-10" } });
    fireEvent.blur(cruce);
    expect(cruce).toHaveAttribute("aria-invalid", "false");
  });

  it("vía con letras sueltas (sin número) → mensaje de que empieza con número", () => {
    renderForm();
    const via = document.querySelector<HTMLInputElement>("#viaNumber")!;
    fireEvent.change(via, { target: { value: "sur" } });
    fireEvent.blur(via);
    expect(document.querySelector("#viaNumber-error")).toHaveTextContent("empieza con número");
  });

  it("el hint de la vía muestra un ejemplo según el tipo elegido", () => {
    renderForm();
    // Default "Calle" → ejemplo "Calle 3".
    expect(document.querySelector("#viaNumber-error")).toHaveTextContent("Calle 3");
    fireEvent.change(document.querySelector('select[name="viaType"]')!, {
      target: { value: "Transversal" },
    });
    expect(document.querySelector("#viaNumber-error")).toHaveTextContent("Transversal 2Bis");
  });
});

/*
 * "Guardar esta dirección en mi cuenta" vs direcciones guardadas (2026-10-12):
 * cuando el cliente logueado aplica una dirección guardada y NO edita nada,
 * guardarla de nuevo no tendría efecto → el checkbox queda DESHABILITADO con
 * hint "Ya está guardada en tu cuenta" (más transparente que ocultarlo). Si
 * edita cualquier campo de la dirección, el checkbox se rehabilita (hay una
 * variante nueva que sí tiene sentido guardar).
 */
describe("DatosForm — 'Guardar en mi cuenta' con dirección guardada aplicada", () => {
  const SAVED = {
    id: "addr-1",
    label: "Casa",
    line1: "Calle 45 # 12-34 (Apto 301)",
    isDefault: true,
    structured: {
      deptCode: "11",
      cityCode: "11001",
      zip: "110111",
      localityId: "",
      neighborhood: "Chapinero",
      kind: "urban",
      viaType: "Calle",
      viaNumber: "45",
      viaBis: false,
      viaCardinal: "",
      cruceNumber: "12-34",
      cruceCardinal: "",
      detail: "Apto 301",
    },
    deptCode: "11",
    cityCode: "11001",
    zip: "110111",
    phone: "3001234567",
  };

  function renderWithSaved() {
    return render(
      <DatosForm
        initial={{ step: 1, updatedAt: 0 }}
        texts={DEFAULT_CHECKOUT_TEXTS.datos}
        canSaveAddress
        savedAddresses={[SAVED]}
      />,
    );
  }

  function saveCheckbox() {
    return document.querySelector<HTMLInputElement>('input[name="saveToAccount"]')!;
  }

  function applySaved() {
    fireEvent.change(document.querySelector("#saved-address")!, { target: { value: "addr-1" } });
  }

  it("sin dirección guardada aplicada, el checkbox está habilitado (flujo normal)", () => {
    renderWithSaved();
    expect(saveCheckbox()).toBeEnabled();
  });

  it("aplicar una guardada SIN editar nada → checkbox deshabilitado + hint", () => {
    renderWithSaved();
    applySaved();
    // Sanidad: los campos efectivamente quedaron precargados.
    expect(document.querySelector<HTMLInputElement>("#viaNumber")!.value).toBe("45");
    expect(saveCheckbox()).toBeDisabled();
    expect(saveCheckbox()).not.toBeChecked();
    expect(screen.getByText(DEFAULT_CHECKOUT_TEXTS.datos.saveCheckSavedHint)).toBeInTheDocument();
  });

  it("editar cualquier campo de la dirección rehabilita el checkbox", () => {
    renderWithSaved();
    applySaved();
    expect(saveCheckbox()).toBeDisabled();
    fireEvent.change(document.querySelector("#viaNumber")!, { target: { value: "45A" } });
    expect(saveCheckbox()).toBeEnabled();
    expect(screen.queryByText(DEFAULT_CHECKOUT_TEXTS.datos.saveCheckSavedHint)).toBeNull();
  });

  it("aplicar una guardada desmarca un 'guardar' previamente marcado", () => {
    renderWithSaved();
    fireEvent.click(saveCheckbox());
    expect(saveCheckbox()).toBeChecked();
    applySaved();
    expect(saveCheckbox()).not.toBeChecked();
    expect(saveCheckbox()).toBeDisabled();
  });
});

/*
 * Tipo de destino (2026-10, anti-devoluciones): selector segmentado con
 * sub-toggle para conjunto residencial, campos condicionales con
 * obligatoriedad por tipo (espejo cliente del superRefine del schema) y
 * migración visual del «Complemento» legacy a punto de referencia.
 */
describe("DatosForm — tipo de destino (anti-devoluciones 2026-10)", () => {
  function destHidden() {
    return document.querySelector<HTMLInputElement>('input[name="destinationType"]')!;
  }

  it("renderiza el selector con las 4 opciones y sin tipo pre-elegido", () => {
    renderForm();
    expect(screen.getByRole("radio", { name: /Casa/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Edificio \/ Apartamento/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Conjunto residencial/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Oficina \/ Empresa/ })).toBeInTheDocument();
    expect(destHidden().value).toBe("");
    // Sin tipo no hay campos estructurados ni el viejo «Complemento» libre.
    expect(document.querySelector("#apartment")).toBeNull();
    expect(document.querySelector("#detail")).toBeNull();
  });

  it("edificio → pide apartamento (obligatorio); el hidden lleva el tipo", () => {
    renderForm();
    fireEvent.click(screen.getByRole("radio", { name: /Edificio \/ Apartamento/ }));
    expect(destHidden().value).toBe("edificio");
    const apto = document.querySelector<HTMLInputElement>("#apartment")!;
    expect(apto).toBeInTheDocument();
    expect(apto.name).toBe("apartment");
    // Sin apartamento, tras el submit aparece el error específico (espejo del superRefine).
    fireEvent.submit(document.querySelector("form")!);
    expect(document.querySelector("#apartment-error")).toHaveTextContent(
      "Falta el número de apartamento",
    );
    expect(apto).toHaveAttribute("aria-invalid", "true");
  });

  it("conjunto residencial abre el sub-toggle Torres | Casas y exige torre + apartamento", () => {
    renderForm();
    fireEvent.click(screen.getByRole("radio", { name: /Conjunto residencial/ }));
    // Default del sub-toggle: torres.
    expect(destHidden().value).toBe("conjunto_torres");
    expect(screen.getByRole("radio", { name: /Torres \/ apartamentos/ })).toBeInTheDocument();
    expect(document.querySelector("#tower")).toBeInTheDocument();
    expect(document.querySelector("#apartment")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /^Casas$/ }));
    expect(destHidden().value).toBe("conjunto_casas");
    expect(document.querySelector("#houseNumber")).toBeInTheDocument();
    expect(document.querySelector("#tower")).toBeNull();
  });

  it("oficina → pide número de oficina y ofrece empresa", () => {
    renderForm();
    fireEvent.click(screen.getByRole("radio", { name: /Oficina \/ Empresa/ }));
    expect(destHidden().value).toBe("oficina");
    expect(document.querySelector("#officeNumber")).toBeInTheDocument();
    expect(document.querySelector("#companyName")).toBeInTheDocument();
  });

  it("submit sin tipo de destino → error en el resumen y scroll al selector", async () => {
    const scrollSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
    renderForm();
    fireEvent.submit(document.querySelector("form")!);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(DEFAULT_CHECKOUT_TEXTS.datos.destTypeLabel);
    expect(document.querySelector("#destinationType-error")).toHaveTextContent(
      DEFAULT_CHECKOUT_TEXTS.datos.destTypeError,
    );
  });

  it("dirección guardada legacy (detail libre, sin tipo) → migra a punto de referencia al elegir tipo", () => {
    const SAVED_LEGACY = {
      id: "addr-legacy",
      label: "Casa",
      line1: "Calle 45 # 12-34 (Apto 301)",
      isDefault: true,
      structured: {
        deptCode: "11",
        cityCode: "11001",
        kind: "urban",
        viaType: "Calle",
        viaNumber: "45",
        cruceNumber: "12-34",
        detail: "Apto 301",
      },
      deptCode: "11",
      cityCode: "11001",
      zip: "110111",
      phone: "3001234567",
    };
    render(
      <DatosForm
        initial={{ step: 1, updatedAt: 0 }}
        texts={DEFAULT_CHECKOUT_TEXTS.datos}
        canSaveAddress
        savedAddresses={[SAVED_LEGACY]}
      />,
    );
    fireEvent.change(document.querySelector("#saved-address")!, {
      target: { value: "addr-legacy" },
    });
    // Sin tipo elegido todavía: el cliente debe elegirlo (obligatorio).
    expect(destHidden().value).toBe("");
    fireEvent.click(screen.getByRole("radio", { name: /Casa/ }));
    expect(document.querySelector<HTMLInputElement>("#referencePoint")!.value).toBe("Apto 301");
  });

  it("la vista previa refleja la línea compuesta con los campos del tipo", () => {
    renderForm();
    fireEvent.change(document.querySelector("#viaNumber")!, { target: { value: "100" } });
    fireEvent.change(document.querySelector("#cruceNumber")!, { target: { value: "15-20" } });
    fireEvent.click(screen.getByRole("radio", { name: /Conjunto residencial/ }));
    fireEvent.change(document.querySelector("#tower")!, { target: { value: "B" } });
    fireEvent.change(document.querySelector("#apartment")!, { target: { value: "401" } });
    fireEvent.change(document.querySelector("#complexName")!, {
      target: { value: "Conjunto Lucams" },
    });
    expect(
      screen.getByText("Calle 100 # 15-20 (Apto 401, Torre B, Conjunto Lucams)"),
    ).toBeInTheDocument();
  });

  it("rural: teléfono alternativo en la zona (opcional, valida móvil CO)", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("radio", { name: /Rural/ }));
    const altPhone = document.querySelector<HTMLInputElement>("#altPhone-display")!;
    expect(altPhone).toBeInTheDocument();
    fireEvent.change(altPhone, { target: { value: "123" } });
    fireEvent.submit(document.querySelector("form")!);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(DEFAULT_CHECKOUT_TEXTS.datos.altPhoneLabel);
    expect(altPhone).toHaveAttribute("aria-invalid", "true");
    expect(document.querySelector("#altPhone-error")).toHaveTextContent(
      DEFAULT_CHECKOUT_TEXTS.datos.phoneError,
    );
  });
});

/*
 * Capa «campo obligatorio vacío» (2026-10-20, feedback owner — «Continuar al
 * envío no avisa qué falta»): el form va con noValidate (la validación nativa
 * bloqueaba el submit ANTES del handler de React y el resumen «qué falta»
 * nunca aparecía) y handleSubmitAttempt frena el submit con preventDefault
 * cuando hay errores cliente que quedarían visibles — también en el PRIMER
 * intento (computeErrors con todo touched + submitCount+1).
 */
describe("DatosForm — capa «campo obligatorio vacío» (noValidate + preventDefault)", () => {
  const scrollSpy = vi.fn();

  beforeEach(() => {
    // jsdom no implementa scrollIntoView.
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
    vi.mocked(saveDatosAction).mockClear();
  });

  afterEach(() => scrollSpy.mockClear());

  it("submit con requeridos vacíos → resumen con cada label, scroll al primero y SIN llamar la action", async () => {
    renderForm();
    fireEvent.submit(document.querySelector("form")!);

    const alert = await screen.findByRole("alert");
    for (const label of [
      DEFAULT_CHECKOUT_TEXTS.datos.nameLabel,
      DEFAULT_CHECKOUT_TEXTS.datos.emailLabel,
      DEFAULT_CHECKOUT_TEXTS.datos.phoneLabel,
      "Departamento",
      DEFAULT_CHECKOUT_TEXTS.datos.cityLabel,
      DEFAULT_CHECKOUT_TEXTS.datos.viaLabel,
      DEFAULT_CHECKOUT_TEXTS.datos.cruceLabel,
      DEFAULT_CHECKOUT_TEXTS.datos.destTypeLabel,
      "Autorización de tratamiento de datos",
    ]) {
      expect(alert).toHaveTextContent(label);
    }
    // El primer submit ya se frena en cliente: no hay round-trip al server.
    expect(vi.mocked(saveDatosAction)).not.toHaveBeenCalled();
    // Scroll + foco al primer campo del DOM con error (Nombre completo).
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(scrollSpy.mock.contexts[0]).toBe(document.querySelector("#fullName"));
    expect(document.activeElement).toBe(document.querySelector("#fullName"));
  });

  it("campo requerido vacío → aria-invalid + FieldHint «Este campo es obligatorio»", async () => {
    renderForm();
    fireEvent.submit(document.querySelector("form")!);
    await screen.findByRole("alert");

    const fullName = document.querySelector("#fullName")!;
    expect(fullName).toHaveAttribute("aria-invalid", "true");
    expect(fullName).toHaveAttribute("aria-describedby", "fullName-error");
    expect(document.querySelector("#fullName-error")).toHaveTextContent(
      DEFAULT_CHECKOUT_TEXTS.datos.requiredField,
    );
    // Otro requerido vacío (cruce) y el consentimiento muestran el mismo mensaje.
    expect(document.querySelector("#cruceNumber-error")).toHaveTextContent(
      DEFAULT_CHECKOUT_TEXTS.datos.requiredField,
    );
    expect(document.querySelector("#dataConsent-error")).toHaveTextContent(
      DEFAULT_CHECKOUT_TEXTS.datos.requiredField,
    );
  });

  it("con el form completo y válido el submit SÍ viaja al server (sin resumen)", async () => {
    renderForm();
    fillValidRequired();
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(vi.mocked(saveDatosAction)).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
