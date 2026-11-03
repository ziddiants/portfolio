// "@version" is a build-time alias to the active version's settings file (astro.config.mjs).
// Its type comes from the schema, so pages type-check the same way for every version.
declare module '@version' {
  const settings: import('astro/zod').infer<typeof import('../versions/schema.mjs').versionSchema>;
  export default settings;
}
