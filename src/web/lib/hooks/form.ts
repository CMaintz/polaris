import { type FormEvent, useState } from "react";

/** Text-field state with a `field(name)` binder that spreads onto an input or select. */
export function useFields<T extends Record<keyof T, string>>(initial: T) {
  const [values, setValues] = useState(initial);
  const field = (name: keyof T) => ({
    value: values[name],
    onChange: (e: { target: { value: string } }) =>
      setValues({ ...values, [name]: e.target.value }),
  });
  return { values, setValues, field };
}

/** A create form: it clears after a successful submit and keeps its values on an error. */
export function useForm<T extends Record<keyof T, string>>(
  initial: T,
  onSubmit: (values: T) => Promise<unknown>,
) {
  const { values, setValues, field } = useFields(initial);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
      setValues(initial);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };
  return { values, field, submit, error, busy };
}
