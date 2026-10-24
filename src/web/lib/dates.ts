export const today = () => new Date().toISOString().slice(0, 10);

export const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
