# Owner configurations — session handler

API HANDLER ONLY, not mounted as an HTTP route or editor in this prefix. The session
gateway validates the selected root and fixed children, then performs one CAS call. Full
HTTP and cookie guidance follows with the route. No schema application, activation,
SQL/Auth/RLS/race/browser proof.

## API implementation exports

`catalog-configuration-gateway.ts` exports `ConfigurationSave`,
`CatalogConfigurationGateway`, `ConfigurationRequestDependencies`,
`parseConfigurationSave`, `parseConfigurationRecord`, `configurationStateKey`,
`createCatalogConfigurationGateway` and `handleCatalogConfigurationRequest`.
Only the handler is an authorization boundary. Gateway methods are request-local
session dependencies, not independent authorization APIs.
