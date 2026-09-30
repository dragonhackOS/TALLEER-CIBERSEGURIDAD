export const metadata = { title: "Aviso de privacidad" };

export default function PrivacyPage() {
  return (
    <div className="container max-w-3xl py-10 sm:py-14">
      <article className="card p-6 sm:p-10">
        <p className="eyebrow">Documento</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Aviso de privacidad</h1>
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-slate-600">
          <p className="rounded-xl bg-brand-50 p-4 font-medium text-brand-900">
            Los datos proporcionados serán utilizados únicamente para administrar tu participación en los talleres.
          </p>
          <h2 className="pt-2 text-lg font-bold text-slate-900">Datos que recabamos</h2>
          <p>Nombre completo, correo institucional, salón, semestre y, de manera opcional, teléfono y experiencia previa en programación, ciberseguridad y competencias CTF.</p>
          <h2 className="pt-2 text-lg font-bold text-slate-900">Finalidad</h2>
          <p>Gestionar inscripciones, cupos, lista de espera, confirmaciones por correo y registro de asistencia a los talleres de la Escuela Preparatoria Yucatán.</p>
          <h2 className="pt-2 text-lg font-bold text-slate-900">Resguardo</h2>
          <p>La información se almacena en servidores con acceso restringido al personal autorizado. No se comparte con terceros ni se utiliza con fines comerciales. El código QR de asistencia no contiene datos personales.</p>
          <h2 className="pt-2 text-lg font-bold text-slate-900">Derechos</h2>
          <p>Puedes solicitar la consulta, corrección o eliminación de tus datos a la coordinación de talleres de la institución.</p>
          <p className="text-sm text-slate-400">Este texto es una plantilla y debe ser revisado por el área jurídica de la institución antes de su publicación.</p>
        </div>
      </article>
    </div>
  );
}
