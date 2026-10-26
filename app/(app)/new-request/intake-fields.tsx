"use client";

import { MapPin } from "lucide-react";
import type { ServiceIntake, IntakeField } from "@/lib/service-intake";

// Renders the questions a particular service needs answered. The spec comes
// from lib/service-intake.ts, which the server validates against — so this
// component decides presentation only, never what is acceptable.

const INPUT =
  "w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm " +
  "focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400";

function Label({ field }: { field: IntakeField }) {
  return (
    <>
      <span className="text-xs font-semibold text-slate-700">
        {field.label}
        {field.required && <span className="text-rose-600" aria-hidden="true"> *</span>}
        {!field.required && <span className="text-slate-400 font-normal"> (optional)</span>}
      </span>
      {field.hint && (
        <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">{field.hint}</span>
      )}
    </>
  );
}

function Field({ field, value }: { field: IntakeField; value?: string | string[] }) {
  const name = `intake_${field.key}`;
  // Restored answers from a submit that came back needing attention. React
  // 19 resets an uncontrolled form once its action resolves, so without
  // these the customer's brief is wiped the moment the address needs
  // confirming — and the resubmit then fails required-field validation on
  // fields they had already filled in.
  const single = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const many = Array.isArray(value) ? value : value ? [value] : [];

  if (field.type === "checkboxes") {
    return (
      // data-required-group is read by the form's submit check. HTML has
      // no native "at least one of these", so a required checkbox group
      // was declared required in the spec, enforced by the server, and
      // completely unenforced in the browser — the customer only found
      // out after submitting.
      <fieldset
        data-required-group={field.required ? "true" : undefined}
        data-friendly={field.label}
      >
        <legend><Label field={field} /></legend>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {(field.options ?? []).map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-xs cursor-pointer hover:border-brand-300"
            >
              <input
                type="checkbox" name={name} value={o.value}
                defaultChecked={many.includes(o.value)}
                className="w-3.5 h-3.5 rounded accent-brand-600"
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.type === "select" || field.type === "duration") {
    return (
      <label className="block">
        <Label field={field} />
        <select name={name} required={field.required} defaultValue={single} className={`${INPUT} mt-1.5`}>
          <option value="" disabled>
            Choose…
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="block">
        <Label field={field} />
        <textarea
          name={name} required={field.required} rows={3}
          maxLength={field.maxLength ?? 500}
          placeholder={field.placeholder}
          defaultValue={single}
          className={`${INPUT} mt-1.5`}
        />
      </label>
    );
  }

  if (field.type === "number") {
    return (
      <label className="block">
        <Label field={field} />
        <span className="mt-1.5 flex items-center gap-2">
          <input
            type="number" name={name} required={field.required}
            min={field.min} max={field.max}
            defaultValue={single}
            className={`${INPUT} max-w-[9rem]`}
          />
          {field.unit && <span className="text-xs text-slate-500">{field.unit}</span>}
        </span>
      </label>
    );
  }

  // text and destination. A destination is still a typed address: it is
  // geocoded and boundary-checked server-side like the pickup, so it gets a
  // pin affordance but no special client behaviour.
  return (
    <label className="block">
      <Label field={field} />
      <span className="mt-1.5 block relative">
        {field.type === "destination" && (
          <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
        )}
        <input
          type="text" name={name} required={field.required}
          maxLength={field.maxLength ?? 200}
          placeholder={field.placeholder}
          defaultValue={single}
          className={`${INPUT} ${field.type === "destination" ? "pl-10" : ""}`}
        />
      </span>
    </label>
  );
}

export function IntakeFields({
  spec, serviceTitle, values,
}: {
  spec: ServiceIntake;
  serviceTitle: string;
  /** Answers echoed back by a failed submit, keyed without the `intake_` prefix. */
  values?: Record<string, string | string[]>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900">About your {serviceTitle.toLowerCase()}</h3>
        {spec.intro && <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{spec.intro}</p>}
      </div>
      {spec.fields.map((f) => (
        <Field key={f.key} field={f} value={values?.[f.key]} />
      ))}
    </div>
  );
}
