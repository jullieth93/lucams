/*
 * /mi-cuenta/eliminar — Eliminar cuenta (derecho de supresión, Ley 1581).
 * Explica qué se borra y qué se conserva (retención fiscal DIAN) antes de confirmar.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { getCurrentCustomer } from "@/lib/auth";
import { DeleteAccountForm } from "./delete-account-form";
import { getAccountTexts } from "../account-texts.server";

export const metadata: Metadata = {
  title: "Eliminar cuenta",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EliminarCuentaPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?next=/mi-cuenta/seguridad");

  const texts = await getAccountTexts();

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/mi-cuenta/seguridad"
        className="text-brand-muted hover:text-brand-purple mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ChevronLeft className="h-3 w-3" />
        {texts.security.title}
      </Link>
      <header className="mb-6">
        <h1 className="font-display flex items-center gap-2 text-3xl text-rose-800">
          <TriangleAlert className="h-7 w-7" />
          {texts.delete.title}
        </h1>
        <div className="text-brand-muted [&_strong]:text-brand-purple-dark mt-2 text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {texts.delete.warn}
          </ReactMarkdown>
        </div>
      </header>

      <div className="border-brand-purple/15 mb-6 rounded-2xl border bg-white p-5 text-sm shadow-sm sm:p-6">
        <p className="text-brand-purple-dark font-semibold">{texts.delete.listTitle}</p>
        <ul className="text-brand-muted [&_strong]:text-brand-purple-dark mt-2 space-y-1.5">
          <li>{texts.delete.item1}</li>
          <li>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {texts.delete.item2}
            </ReactMarkdown>
          </li>
          <li>{texts.delete.item3}</li>
          <li>{texts.delete.item4}</li>
          <li>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {texts.delete.item5}
            </ReactMarkdown>
          </li>
        </ul>
        <p className="text-brand-muted mt-3 text-xs">
          {texts.delete.contact}{" "}
          <a
            href={`mailto:${texts.delete.contactEmail}`}
            className="text-brand-pink-ink font-medium"
          >
            {texts.delete.contactEmail}
          </a>
          .
        </p>
      </div>

      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm sm:p-6">
        <DeleteAccountForm texts={texts.delete} />
      </div>
    </div>
  );
}
