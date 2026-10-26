import { type FormEvent, useState } from "react";

export function useForm<T extends Record<string, string>>(
  initial: T,
  onSubmit: (values: T) => Promise<unknown>,
) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const field = (name: keyof T) => ({
    value: values[name],
    onChange: (e: { target: { value: string } }) =>
      setValues({ ...values, [name]: e.target.value }),
  });
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

export const today = () => new Date().toISOString().slice(0, 10);

export const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
