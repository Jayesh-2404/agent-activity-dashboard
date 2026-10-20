export function appOrigin(configured: string | undefined, requestOrigin: string): string {
  const value = configured?.trim();
  return new URL(value || requestOrigin).origin;
}
